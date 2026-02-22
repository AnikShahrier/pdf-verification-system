// backend/routes/fileRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { verifyToken, authorizeRole } = require('../middleware/auth');
const pool = require('../config/db');

// Import the certificate generator from utils
const { generateEApostilleCertificate } = require('../utils/certificateGenerator');

// ========== HELPER FUNCTIONS ==========

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
    const { PDFDocument } = require('pdf-lib');
    await PDFDocument.load(fileBytes);
    return true;
  } catch (err) {
    console.error('❌ PDF validation failed:', err.message);
    return false;
  }
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
    
    const ratio = Math.min(
      (width - 100) / image.width,
      (height - 100) / image.height
    );
    
    const scaledWidth = image.width * ratio;
    const scaledHeight = image.height * ratio;
    
    const x = (width - scaledWidth) / 2;
    const y = (height - scaledHeight) / 2;
    
    page.drawImage(image, {
      x: x,
      y: y,
      width: scaledWidth,
      height: scaledHeight,
    });
    
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
  limits: { fileSize: 10 * 1024 * 1024 }
});

// ========== ROUTES ==========

// Upload files (user only)
router.post('/upload', verifyToken, upload.array('files', 10), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const hasPDF = req.files.some(f => f.mimetype === 'application/pdf');
    const hasImages = req.files.some(f => f.mimetype.startsWith('image/'));
    
    if (hasPDF && hasImages) {
      req.files.forEach(f => fs.unlink(f.path).catch(() => {}));
      return res.status(400).json({ 
        message: 'Cannot mix PDF and images. Upload PDF alone or multiple images only.' 
      });
    }
    
    if (hasPDF && req.files.length > 1) {
      req.files.forEach(f => fs.unlink(f.path).catch(() => {}));
      return res.status(400).json({ 
        message: 'Only one PDF file allowed per upload.' 
      });
    }

    const fileData = req.files.map(file => ({
      path: file.path,
      original_name: file.originalname
    }));
    
    const file_type = hasPDF ? 'pdf' : (req.files.length > 1 ? 'multi-image' : 'image');
    const original_filename = fileData.map(f => f.original_name).join(', ');

    const newUpload = await pool.query(
      `INSERT INTO uploads 
       (user_id, original_filename, file_path, file_paths, file_type, status) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING *`,
      [
        req.user.id,
        original_filename,
        fileData[0].path,
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
    if (req.files) {
      req.files.forEach(file => fs.unlink(file.path).catch(() => {}));
    }
    res.status(500).json({ message: 'Server error during upload', error: err.message });
  }
});

// Replace files for pending upload
router.put('/replace/:id', verifyToken, upload.array('files', 10), async (req, res) => {
  try {
    const { id } = req.params;
    
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
    
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }
    
    const fileData = [];
    for (const file of req.files) {
      const fileExt = path.extname(file.originalname).toLowerCase();
      const isPDF = fileExt === '.pdf';
      const isImage = ['.png', '.jpg', '.jpeg'].includes(fileExt);
      
      if (!isPDF && !isImage) {
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
    
    const isMultiImage = fileData.length > 1;
    const file_type = isMultiImage ? 'multi-image' : 
                      (path.extname(fileData[0].original_name).toLowerCase() === '.pdf' ? 'pdf' : 'image');

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
        fileNameOnly,
        id
      ]
    );
    
    res.json({
      message: `${fileData.length} file(s) replaced successfully`,
      data: updatedUpload.rows[0]
    });
  } catch (err) {
    console.error('Replace file error:', err);
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

// Verify file (admin only) - Generates e-APOSTILLE certificate
router.post('/verify/:id', verifyToken, authorizeRole('admin'), async (req, res) => {
  try {
    const { id } = req.params;
    
    // DEBUG: Log incoming request body
    console.log('📥 Received verification request body:', req.body);
    
    const { 
      documentIssuer,      // Field 2: has been signed by
      documentTitle,       // Field 3: acting in the capacity of (maps to actingCapacity)
      documentLocation,    // Field 4: bears the seal/stamp of (maps to sealLocation)
      certificateLocation, // Field 5: at [location]
      certificateDate,     // Field 6: the [date]
      authorityName        // Field 7: by [name]
    } = req.body;
    
    // Validate inputs
    const missingFields = [];
    if (!documentIssuer) missingFields.push('documentIssuer');
    if (!documentTitle) missingFields.push('documentTitle (actingCapacity)');
    if (!documentLocation) missingFields.push('documentLocation (sealLocation)');
    if (!certificateLocation) missingFields.push('certificateLocation');
    if (!certificateDate) missingFields.push('certificateDate');
    if (!authorityName) missingFields.push('authorityName');
    
    if (missingFields.length > 0) {
      console.error('❌ Missing fields:', missingFields);
      return res.status(400).json({ 
        message: 'All certificate fields are required',
        missingFields: missingFields,
        receivedBody: req.body
      });
    }

    // Get upload record
    const uploadRes = await pool.query('SELECT * FROM uploads WHERE id = $1', [id]);
    if (uploadRes.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }

    const upload = uploadRes.rows[0];
    if (upload.status !== 'pending') {
      return res.status(400).json({ 
        message: 'Only pending files can be verified' 
      });
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
      return res.status(404).json({ 
        message: 'Original file(s) missing. Upload may be corrupted.' 
      });
    }

    console.log(`✅ Starting e-APOSTILLE verification for upload ID: ${id}`);

    // Create certificate data object - MUST match what certificateGenerator expects
    // In the verify route, update certificateData to include baseUrl:
const certificateData = {
  country: 'BANGLADESH',
  documentIssuer: documentIssuer,
  actingCapacity: documentTitle,
  sealLocation: documentLocation,
  certificateLocation: certificateLocation,
  certificateDate: certificateDate,
  authorityName: authorityName.toLowerCase(),
  baseUrl: `${req.protocol}://${req.get('host')}` // For QR code URL
};

    console.log('📄 Certificate data being sent to generator:', certificateData);

    // Call the imported function from certificateGenerator.js
    let pdfBytes, certificateNumber;
    try {
      const result = await generateEApostilleCertificate(certificateData, upload);
      pdfBytes = result.pdfBytes;
      certificateNumber = result.certificateNumber;
    } catch (certErr) {
      console.error('❌ Certificate generation failed:', certErr);
      return res.status(500).json({
        message: 'Certificate generation failed',
        error: certErr.message,
        stack: certErr.stack
      });
    }
    
    // Save certificate PDF
    const uploadDir = path.join(__dirname, '../', process.env.UPLOAD_DIR || 'uploads');
    const newFileName = `certificate_${certificateNumber}_${Date.now()}.pdf`;
    const newFilePath = path.join(uploadDir, newFileName);
    
    await fs.writeFile(newFilePath, pdfBytes);
    console.log(`✅ e-APOSTILLE certificate saved: ${newFilePath}`);

    // Update database - Use existing columns, map certificateLocation to document_location for now
    // or add certificate_location column to your database
    try {
      const result = await pool.query(
        `UPDATE uploads 
         SET status = 'verified', 
             certificate_data = $1, 
             certificate_number = $2,
             verified_by = $3, 
             verified_at = NOW(),
             file_path = $4,
             original_filename = $5,
             document_issuer = $6,
             document_title = $7,
             document_location = $8,
             certificate_date = $9,
             authority_name = $10
         WHERE id = $11
         RETURNING *`,
        [
          JSON.stringify(certificateData),
          certificateNumber,
          req.user.id,
          newFilePath,
          `certificate_${certificateNumber}.pdf`,
          documentIssuer,
          documentTitle,
          certificateLocation, // Using certificateLocation for document_location (or create new column)
          certificateDate,
          authorityName,
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

      console.log(`✅✅✅ e-APOSTILLE CERTIFICATE GENERATED SUCCESSFULLY FOR UPLOAD #${id} ✅✅✅`);
      res.json({ 
        message: 'e-APOSTILLE certificate generated successfully', 
        data: result.rows[0],
        certificateNumber
      });
    } catch (dbErr) {
      console.error('❌ Database update failed:', dbErr);
      // Clean up certificate file if DB fails
      await fs.unlink(newFilePath).catch(() => {});
      throw dbErr;
    }
    
  } catch (err) {
    console.error('❌❌❌ e-APOSTILLE GENERATION FAILED ❌❌❌');
    console.error('Error:', err.message);
    console.error('Stack:', err.stack);
    res.status(500).json({ 
      message: 'Certificate generation failed', 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// Delete upload
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const uploadRes = await pool.query('SELECT * FROM uploads WHERE id = $1', [id]);
    if (uploadRes.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }
    
    const upload = uploadRes.rows[0];
    
    if (upload.status !== 'pending') {
      return res.status(400).json({ 
        message: 'Only pending uploads can be deleted.' 
      });
    }
    
    if (req.user.role !== 'admin' && upload.user_id !== req.user.id) {
      return res.status(403).json({ 
        message: 'Access denied' 
      });
    }
    
    try {
      if (upload.file_paths && Array.isArray(upload.file_paths)) {
        for (const file of upload.file_paths) {
          if (file.path) await fs.unlink(file.path).catch(() => {});
        }
      } else if (upload.file_path) {
        await fs.unlink(upload.file_path).catch(() => {});
      }
    } catch (err) {
      console.warn(`⚠️ Could not delete files: ${err.message}`);
    }
    
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