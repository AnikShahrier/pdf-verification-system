// backend/routes/fileRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { verifyToken, authorizeRole } = require('../middleware/auth');
const pool = require('../config/db');

// ========== HELPER FUNCTIONS ==========
function sanitizeForPDF(text) {
  if (!text) return '';
  return text.toString().replace(/[^\x00-\x7F]/g, '').trim() || 'N/A';
}

async function isValidPDF(filePath) {
  try {
    const fileBytes = await fs.readFile(filePath);
    if (fileBytes.length === 0) {
      console.error('❌ PDF file is empty:', filePath);
      return false;
    }
    const magicNumber = fileBytes.subarray(0, 4).toString('utf8');
    if (magicNumber !== '%PDF') {
      console.error('❌ Invalid PDF magic number:', magicNumber);
      return false;
    }
    await PDFDocument.load(fileBytes);
    return true;
  } catch (err) {
    console.error('❌ PDF validation failed:', err.message);
    return false;
  }
}

async function createCertificatePage(name, position, department, uploadId) {
  const certDoc = await PDFDocument.create();
  const certPage = certDoc.addPage([612, 792]);
  const { width, height } = certPage.getSize();
  
  const boldFont = await certDoc.embedFont(StandardFonts.HelveticaBold);
  const normalFont = await certDoc.embedFont(StandardFonts.Helvetica);

  const safeName = sanitizeForPDF(name);
  const safePosition = sanitizeForPDF(position);
  const safeDepartment = sanitizeForPDF(department);
  const safeUploadId = sanitizeForPDF(uploadId.toString());

  certPage.drawText('GOVERNMENT OF THE PEOPLE\'S REPUBLIC OF BANGLADESH', {
    x: 50, y: height - 60, size: 16, font: boldFont, color: rgb(0, 0.5, 0)
  });
  certPage.drawText('OFFICIAL CERTIFICATE', {
    x: 50, y: height - 90, size: 24, font: boldFont, color: rgb(0, 0.5, 0)
  });
  certPage.drawText('Document Details:', { x: 50, y: height - 140, size: 14, font: boldFont });
  certPage.drawText(`Name: ${safeName}`, { x: 50, y: height - 170, size: 12, font: normalFont });
  certPage.drawText(`Position: ${safePosition}`, { x: 50, y: height - 195, size: 12, font: normalFont });
  certPage.drawText(`Department: ${safeDepartment}`, { x: 50, y: height - 220, size: 12, font: normalFont });
  certPage.drawText(`Application No: ${safeUploadId}`, { x: 50, y: height - 245, size: 12, font: normalFont });
  certPage.drawText(`Date: ${new Date().toLocaleDateString('en-US')}`, { x: 50, y: height - 270, size: 12, font: normalFont });
  certPage.drawText('This document has been officially verified by the Government of Bangladesh', {
    x: 50, y: 100, size: 10, font: normalFont, color: rgb(0.5, 0.5, 0.5)
  });
  return certDoc;
}

async function createSignaturePage(adminName, position) {
  const sigDoc = await PDFDocument.create();
  const sigPage = sigDoc.addPage([612, 792]);
  const boldFont = await sigDoc.embedFont(StandardFonts.HelveticaBold);
  const normalFont = await sigDoc.embedFont(StandardFonts.Helvetica);
  const safeAdminName = sanitizeForPDF(adminName);
  const safePosition = sanitizeForPDF(position);
  sigPage.drawText('OFFICIAL APPROVAL SIGNATURE', { x: 50, y: 400, size: 18, font: boldFont, color: rgb(0, 0.5, 0) });
  sigPage.drawText(`Verified By: ${safeAdminName}`, { x: 50, y: 350, size: 14, font: boldFont });
  sigPage.drawText(`Position: ${safePosition}`, { x: 50, y: 325, size: 12, font: normalFont });
  sigPage.drawText(`Date: ${new Date().toLocaleDateString('en-US')}`, { x: 50, y: 300, size: 12, font: normalFont });
  return sigDoc;
}

async function embedImageToPDF(pdfDoc, imagePath) {
  try {
    const imageBytes = await fs.readFile(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    let image;
    if (ext === '.png') {
      image = await pdfDoc.embedPng(imageBytes);
    } else if (['.jpg', '.jpeg'].includes(ext)) {
      image = await pdfDoc.embedJpg(imageBytes);
    } else {
      throw new Error('Unsupported image format');
    }
    const page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    const ratio = Math.min((width - 100) / image.width, (height - 100) / image.height);
    const scaledWidth = image.width * ratio;
    const scaledHeight = image.height * ratio;
    const x = (width - scaledWidth) / 2;
    const y = (height - scaledHeight) / 2;
    page.drawImage(image, { x, y, width: scaledWidth, height: scaledHeight });
    return pdfDoc;
  } catch (err) {
    console.error('❌ Image embedding failed:', err.message);
    throw err;
  }
}

// ========== MULTER CONFIGURATION ==========
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../', process.env.UPLOAD_DIR || 'uploads');
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF, PNG, and JPEG files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ========== ROUTES ==========
// Upload files (user only) - Supports multiple images OR single PDF
router.post('/upload', verifyToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    // Validate files
    const hasPDF = req.files.some(f => f.mimetype === 'application/pdf');
    const hasImages = req.files.some(f => f.mimetype.startsWith('image/'));
    
    // Block mixed uploads
    if (hasPDF && hasImages) {
      // Clean up uploaded files
      req.files.forEach(f => fs.unlink(f.path).catch(() => {}));
      return res.status(400).json({ 
        message: 'Cannot mix PDF and images. Upload PDF alone or multiple images only.' 
      });
    }
    
    // Block multiple PDFs
    if (hasPDF && req.files.length > 1) {
      req.files.forEach(f => fs.unlink(f.path).catch(() => {}));
      return res.status(400).json({ 
        message: 'Only one PDF file allowed per upload. For multiple images, upload images only.' 
      });
    }

    // Prepare file data
    const fileData = req.files.map(file => ({
      path: file.path,
      original_name: file.originalname
    }));
    
    // Determine upload type
    const file_type = hasPDF ? 'pdf' : (req.files.length > 1 ? 'multi-image' : 'image');
    const original_filename = fileData.map(f => f.original_name).join(', ');

    // Save to database
    const newUpload = await pool.query(
      `INSERT INTO uploads 
       (user_id, original_filename, file_path, file_paths, file_type, status) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [
        req.user.id,
        original_filename,
        fileData[0].path, // First file for backward compatibility
        JSON.stringify(fileData),
        file_type,
        'pending'
      ]
    );

    res.status(201).json({
      message: `File${req.files.length > 1 ? 's' : ''} uploaded successfully`,
      data: newUpload.rows[0]
    });
  } catch (err) {
    console.error('Upload error:', err);
    // Clean up files on error
    if (req.files) {
      req.files.forEach(file => fs.unlink(file.path).catch(() => {}));
    }
    res.status(500).json({ message: 'Server error during upload', error: err.message });
  }
});

// Replace file for pending upload (user only)
// Replace files for pending upload (user only) - FIXED FOR MULTIPLE FILES
router.put('/replace/:id', verifyToken, upload.array('files', 10), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get existing upload
    const uploadRes = await pool.query(
      'SELECT * FROM uploads WHERE id = $1 AND user_id = $2 AND status = $3',
      [id, req.user.id, 'pending']
    );
    
    if (uploadRes.rows.length === 0) {
      return res.status(404).json({ 
        message: 'Pending upload not found or already verified' 
      });
    }
    
    const upload = uploadRes.rows[0];
    
    // Delete old file(s)
    try {
      if (upload.file_paths && Array.isArray(upload.file_paths)) {
        for (const file of upload.file_paths) {
          if (file.path) await fs.unlink(file.path).catch(() => {});
        }
      } else if (upload.file_path) {
        await fs.unlink(upload.file_path).catch(() => {});
      }
    } catch (err) {
      console.warn('Could not delete old files:', err.message);
    }
    
    // Validate new files - FIXED: use req.files (plural)
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }
    
    // Validate all files
    const fileData = [];
    for (const file of req.files) {
      const fileExt = path.extname(file.originalname).toLowerCase();
      const isPDF = fileExt === '.pdf';
      const isImage = ['.png', '.jpg', '.jpeg'].includes(fileExt);
      
      if (!isPDF && !isImage) {
        // Clean up uploaded files if validation fails
        for (const f of req.files) {
          await fs.unlink(f.path).catch(() => {});
        }
        return res.status(400).json({ message: 'Only PDF, PNG, and JPEG files are allowed' });
      }
      
      fileData.push({
        path: file.path,
        original_name: file.originalname
      });
    }
    
    // Determine upload type
    const isMultiImage = fileData.length > 1;
    const file_type = isMultiImage ? 'multi-image' : 
                      (path.extname(fileData[0].original_name).toLowerCase() === '.pdf' ? 'pdf' : 'image');

    // Update database - FIXED: store ONLY filename, not full path
    const fileNameOnly = path.basename(fileData[0].path);
    const updatedUpload = await pool.query(
      `UPDATE uploads 
       SET file_paths = $1,
           file_type = $2,
           original_filename = $3,
           file_path = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        JSON.stringify(fileData),
        file_type,
        fileData.map(f => f.original_name).join(', '),
        fileNameOnly, // CRITICAL FIX: Store only filename, not full path
        id
      ]
    );
    
    res.json({
      message: `${fileData.length} file(s) replaced successfully`,
      data: updatedUpload.rows[0]
    });
  } catch (err) {
    console.error('Replace file error:', err);
    // Clean up uploaded files on error
    if (req.files) {
      req.files.forEach(file => {
        fs.unlink(file.path).catch(() => {});
      });
    }
    res.status(500).json({ message: 'Server error during file replacement', error: err.message });
  }
});

// Get user's uploads
router.get('/my-uploads', verifyToken, async (req, res) => {
  try {
    const uploads = await pool.query(
      `SELECT * FROM uploads WHERE user_id = $1 ORDER BY created_at DESC`,
      [req.user.id]
    );
    res.json(uploads.rows);
  } catch (err) {
    console.error('Error fetching uploads:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Get pending uploads (admin only)
router.get('/pending', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const pendingUploads = await pool.query(
      `SELECT uploads.*, users.name AS user_name, users.email AS user_email 
       FROM uploads 
       JOIN users ON uploads.user_id = users.id 
       WHERE uploads.status = 'pending' 
       ORDER BY uploads.created_at DESC`
    );
    res.json(pendingUploads.rows);
  } catch (err) {
    console.error('Error fetching pending uploads:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});


// ADD THIS NEW ROUTE (keep your existing replace route)
router.patch('/edit/:id', verifyToken, upload.array('files', 10), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get existing upload
    const uploadRes = await pool.query(
      'SELECT * FROM uploads WHERE id = $1 AND user_id = $2 AND status = $3',
      [id, req.user.id, 'pending']
    );
    
    if (uploadRes.rows.length === 0) {
      return res.status(404).json({ 
        message: 'Pending upload not found or already verified' 
      });
    }
    
    const upload = uploadRes.rows[0];
    
    // Parse request body for operations
    const { removeFiles = [], addFiles = [] } = req.body;
    
    // Validate removeFiles (must be indices of existing files)
    const existingFiles = upload.file_paths && Array.isArray(upload.file_paths) 
      ? upload.file_paths 
      : [{ path: upload.file_path, original_name: upload.original_filename }];
    
    const filesToRemove = [];
    for (const index of removeFiles) {
      if (index >= 0 && index < existingFiles.length) {
        filesToRemove.push(existingFiles[index]);
      }
    }
    
    // Delete removed files
    for (const file of filesToRemove) {
      await fs.unlink(file.path).catch(() => {});
    }
    
    // Process new files
    const newFileData = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const fileExt = path.extname(file.originalname).toLowerCase();
        const isPDF = fileExt === '.pdf';
        const isImage = ['.png', '.jpg', '.jpeg'].includes(fileExt);
        
        if (!isPDF && !isImage) {
          await fs.unlink(file.path).catch(() => {});
          return res.status(400).json({ message: 'Only PDF, PNG, and JPEG files are allowed' });
        }
        
        newFileData.push({
          path: file.path,
          original_name: file.originalname
        });
      }
    }
    
    // Build new file list: existing files (not removed) + new files
    const remainingFiles = existingFiles.filter((_, index) => !removeFiles.includes(index));
    const allFiles = [...remainingFiles, ...newFileData];
    
    // Update database
    const updatedUpload = await pool.query(
      `UPDATE uploads 
       SET file_paths = $1,
           file_type = $2,
           original_filename = $3,
           file_path = $4,
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        JSON.stringify(allFiles),
        allFiles.length > 1 ? 'multi-image' : 
        (allFiles.length > 0 && path.extname(allFiles[0].original_name).toLowerCase() === '.pdf' ? 'pdf' : 'image'),
        allFiles.map(f => f.original_name).join(', '),
        allFiles.length > 0 ? path.basename(allFiles[0].path) : '',
        id
      ]
    );
    
    res.json({
      message: `${filesToRemove.length} file(s) removed, ${newFileData.length} file(s) added`,
      data: updatedUpload.rows[0]
    });
  } catch (err) {
    console.error('Edit file error:', err);
    res.status(500).json({ message: 'Server error during file editing', error: err.message });
  }
});

// Get completed uploads (admin only)
router.get('/completed', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const completedUploads = await pool.query(
      `SELECT uploads.*, users.name AS user_name, users.email AS user_email, 
              verifier.name AS verified_by_name
       FROM uploads 
       JOIN users ON uploads.user_id = users.id
       LEFT JOIN users verifier ON uploads.verified_by = verifier.id
       WHERE uploads.status = 'verified' 
       ORDER BY uploads.verified_at DESC`
    );
    res.json(completedUploads.rows);
  } catch (err) {
    console.error('Error fetching completed uploads:', err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify file (admin only) - Handles PDF, single image, and multiple images
router.post('/verify/:id', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, position, department } = req.body;
    const adminId = req.user.id;

    if (!name || !position || !department) {
      return res.status(400).json({ message: 'All certificate fields are required' });
    }

    // Get upload record (includes file_paths and file_type)
    const uploadRes = await pool.query('SELECT * FROM uploads WHERE id = $1', [id]);
    if (uploadRes.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }

    const upload = uploadRes.rows[0];
    if (upload.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending files can be verified' });
    }

    // Verify file(s) exist
    try {
      if (upload.file_paths && Array.isArray(upload.file_paths)) {
        for (const file of upload.file_paths) {
          await fs.access(file.path);
        }
      } else {
        await fs.access(upload.file_path);
      }
    } catch (err) {
      console.error('❌ File(s) not found:', err.message);
      return res.status(404).json({ message: 'Original file(s) missing. Upload may be corrupted.' });
    }

    console.log(`✅ Starting verification for upload ID: ${id}`);
    console.log(`📁 File type: ${upload.file_type || 'unknown'}`);
    console.log(`🖼️ Files to process: ${upload.file_paths ? upload.file_paths.length : 1}`);

    // Create certificate and signature pages
    const certDoc = await createCertificatePage(name, position, department, id);
    const sigDoc = await createSignaturePage(req.user.name, position);
    const combinedDoc = await PDFDocument.create();
    
    // Add certificate page (FIRST PAGE)
    const [certPage] = await combinedDoc.copyPages(certDoc, [0]);
    combinedDoc.addPage(certPage);
    console.log('✅ Certificate page added');

    // Process content based on upload type
    const filesToProcess = upload.file_paths && Array.isArray(upload.file_paths) 
      ? upload.file_paths 
      : [{ path: upload.file_path, original_name: upload.original_filename }];

    if (upload.file_type === 'multi-image') {
      console.log(`🖼️ Processing ${filesToProcess.length} images...`);
      for (const file of filesToProcess) {
        try {
          await embedImageToPDF(combinedDoc, file.path);
          console.log(`✅ Image embedded: ${file.original_name}`);
        } catch (err) {
          console.error(`❌ Failed to embed ${file.original_name}:`, err.message);
        }
      }
      console.log(`✅ ${filesToProcess.length} image(s) embedded successfully`);
    } 
    else if (upload.file_type === 'image' || upload.file_type === 'pdf') {
      const mainFile = filesToProcess[0];
      
      if (upload.file_type === 'image') {
        console.log('🖼️ Processing single image...');
        await embedImageToPDF(combinedDoc, mainFile.path);
        console.log('✅ Image embedded successfully');
      } 
      else if (upload.file_type === 'pdf') {
        console.log('📄 Processing PDF...');
        if (!(await isValidPDF(mainFile.path))) {
          console.error('❌ Invalid/corrupted PDF detected');
          return res.status(400).json({ 
            message: 'Invalid or corrupted PDF file. Please upload a valid PDF.',
            error: 'PDF_PARSE_ERROR'
          });
        }
        
        try {
          const pdfBytes = await fs.readFile(mainFile.path);
          const pdfDoc = await PDFDocument.load(pdfBytes);
          console.log(`✅ PDF loaded (${pdfDoc.getPageCount()} pages)`);
          
          const pages = await combinedDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
          pages.forEach(page => combinedDoc.addPage(page));
          console.log(`✅ Added ${pages.length} original pages`);
        } catch (pdfError) {
          console.error('⚠️ PDF processing failed:', pdfError.message);
          console.log('⚠️ Creating certificate-only PDF (skipping original content)');
        }
      }
    } 
    else {
      // Fallback for old uploads without file_type
      const fileExt = path.extname(upload.file_path).toLowerCase();
      const isImage = ['.png', '.jpg', '.jpeg'].includes(fileExt);
      
      if (isImage) {
        console.log('🖼️ Processing image (fallback)...');
        await embedImageToPDF(combinedDoc, upload.file_path);
        console.log('✅ Image embedded successfully');
      } else {
        console.log('📄 Processing PDF (fallback)...');
        if (!(await isValidPDF(upload.file_path))) {
          return res.status(400).json({ message: 'Invalid PDF file' });
        }
        const pdfBytes = await fs.readFile(upload.file_path);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const pages = await combinedDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
        pages.forEach(page => combinedDoc.addPage(page));
      }
    }

    // Add signature page (LAST PAGE)
    const [sigPage] = await combinedDoc.copyPages(sigDoc, [0]);
    combinedDoc.addPage(sigPage);
    console.log('✅ Signature page added');

    // Save verified PDF
    const pdfBytes = await combinedDoc.save();
    const newFileName = `verified_${upload.id}_${Date.now()}.pdf`;
    const uploadDir = path.join(__dirname, '../', process.env.UPLOAD_DIR || 'uploads');
    const newFilePath = path.join(uploadDir, newFileName);
    
    await fs.writeFile(newFilePath, pdfBytes);
    console.log(`✅ Verified PDF saved: ${newFilePath}`);

    // Update database
    const result = await pool.query(
      `UPDATE uploads 
       SET status = 'verified', 
           certificate_data = $1, 
           verified_by = $2, 
           verified_at = NOW(),
           file_path = $3,
           original_filename = $4
       WHERE id = $5
       RETURNING *`,
      [
        JSON.stringify({ name, position, department }),
        adminId,
        newFilePath,
        `verified_${upload.original_filename}`,
        id
      ]
    );

    // Delete original file(s)
    try {
      if (upload.file_paths && Array.isArray(upload.file_paths)) {
        for (const file of upload.file_paths) {
          if (file.path) await fs.unlink(file.path).catch(() => {});
        }
      } else if (upload.file_path) {
        await fs.unlink(upload.file_path).catch(() => {});
      }
      console.log(`✅ Original file(s) deleted`);
    } catch (err) {
      console.warn(`⚠️ Failed to delete original files: ${err.message}`);
    }

    console.log(`✅✅✅ VERIFICATION SUCCESSFUL FOR UPLOAD #${id} ✅✅✅`);
    res.json({ message: 'File verified successfully', data: result.rows[0] });
    
  } catch (err) {
    console.error('❌❌❌ VERIFICATION FAILED ❌❌❌');
    console.error('Error:', err.message);
    res.status(500).json({ 
      message: 'Verification failed', 
      error: err.message
    });
  }
});

// Delete upload (user can delete their own pending uploads, admin can delete any pending upload)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get upload record
    const uploadRes = await pool.query('SELECT * FROM uploads WHERE id = $1', [id]);
    if (uploadRes.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }
    
    const upload = uploadRes.rows[0];
    
    // Only pending uploads can be deleted
    if (upload.status !== 'pending') {
      return res.status(400).json({ 
        message: 'Only pending uploads can be deleted. Verified uploads cannot be removed.' 
      });
    }
    
    // Permission check:
    // - Admins can delete ANY pending upload
    // - Regular users can only delete their OWN pending uploads
    if (req.user.role !== 'admin' && upload.user_id !== req.user.id) {
      return res.status(403).json({ 
        message: 'Access denied: You can only delete your own pending uploads' 
      });
    }
    
    // Delete file(s) from filesystem
    try {
      if (upload.file_paths && Array.isArray(upload.file_paths)) {
        for (const file of upload.file_paths) {
          if (file.path) await fs.unlink(file.path).catch(() => {});
        }
      } else if (upload.file_path) {
        await fs.unlink(upload.file_path).catch(() => {});
      }
      console.log(`✅ Files deleted for upload #${id}`);
    } catch (err) {
      console.warn(`⚠️ Could not delete files: ${err.message}`);
    }
    
    // Delete from database
    await pool.query('DELETE FROM uploads WHERE id = $1', [id]);
    
    res.json({ message: 'আবেদন সফলভাবে মুছে ফেলা হয়েছে!' });
  } catch (err) {
    console.error('Delete upload error:', err);
    res.status(500).json({ 
      message: 'Server error during deletion', 
      error: err.message 
    });
  }
});

module.exports = router;