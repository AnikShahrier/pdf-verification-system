// backend/routes/fileRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const { verifyToken, authorizeRole } = require('../middleware/auth');
const pool = require('../config/db');

// Multer storage configuration
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

// File filter for PDF only
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Only PDF files are allowed!'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Upload file (user only)
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Save to database
    const newUpload = await pool.query(
      'INSERT INTO uploads (user_id, original_filename, file_path, status) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.user.id, req.file.originalname, req.file.path, 'pending']
    );

    res.status(201).json({
      message: 'File uploaded successfully',
      data: newUpload.rows[0]
    });
  } catch (err) {
    console.error('Upload error:', err);
    if (err.message === 'Only PDF files are allowed!') {
      return res.status(400).json({ message: 'Only PDF files are allowed!' });
    }
    res.status(500).json({ message: 'Server error during upload', error: err.message });
  }
});

// Get user's uploads
router.get('/my-uploads', verifyToken, async (req, res) => {
  try {
    const uploads = await pool.query(
      `SELECT * FROM uploads 
       WHERE user_id = $1 
       ORDER BY created_at DESC`,
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

// Verify file (admin only) - FIXED PDF PROCESSING
router.post('/verify/:id', verifyToken, authorizeRole('admin'), async (req, res) => {
  let originalPdfBytes, certDoc, sigDoc, combinedDoc;
  
  try {
    const { id } = req.params;
    const { name, position, department } = req.body;
    const adminId = req.user.id;

    // Validate input
    if (!name || !position || !department) {
      return res.status(400).json({ message: 'All certificate fields are required' });
    }

    // Get upload record
    const uploadRes = await pool.query(
      'SELECT * FROM uploads WHERE id = $1', 
      [id]
    );
    
    if (uploadRes.rows.length === 0) {
      return res.status(404).json({ message: 'Upload not found' });
    }

    const upload = uploadRes.rows[0];
    if (upload.status !== 'pending') {
      return res.status(400).json({ message: 'Only pending files can be verified' });
    }

    console.log(`✅ Starting PDF verification for upload ID: ${id}`);
    console.log(`📁 Original file path: ${upload.file_path}`);

    // Read original PDF
    try {
      originalPdfBytes = await fs.readFile(upload.file_path);
      console.log(`📄 Original PDF loaded (${originalPdfBytes.length} bytes)`);
    } catch (err) {
      console.error('❌ Failed to read original PDF:', err.message);
      return res.status(500).json({ message: 'Failed to read original PDF file' });
    }

    // Load original PDF document
    let pdfDoc;
    try {
      pdfDoc = await PDFDocument.load(originalPdfBytes);
      console.log(`📄 Original PDF has ${pdfDoc.getPageCount()} pages`);
    } catch (err) {
      console.error('❌ Failed to load PDF document:', err.message);
      return res.status(500).json({ message: 'Invalid PDF file format' });
    }

    // Create certificate page (FIRST PAGE)
    certDoc = await PDFDocument.create();
    const certPage = certDoc.addPage([612, 792]); // US Letter size
    const { width, height } = certPage.getSize();
    
    // Use built-in fonts (pdf-lib doesn't support Bengali natively, so we'll use English)
    const boldFont = await certDoc.embedFont(StandardFonts.HelveticaBold);
    const normalFont = await certDoc.embedFont(StandardFonts.Helvetica);

    // Government header (English for compatibility)
    certPage.drawText('GOVERNMENT OF THE PEOPLE\'S REPUBLIC OF BANGLADESH', {
      x: 50,
      y: height - 60,
      size: 16,
      font: boldFont,
      color: rgb(0, 0.5, 0)
    });

    certPage.drawText('OFFICIAL CERTIFICATE', {
      x: 50,
      y: height - 90,
      size: 24,
      font: boldFont,
      color: rgb(0, 0.5, 0)
    });

    // Certificate details
    certPage.drawText('Document Details:', {
      x: 50,
      y: height - 140,
      size: 14,
      font: boldFont
    });

    certPage.drawText(`Name: ${name}`, {
      x: 50,
      y: height - 170,
      size: 12,
      font: normalFont
    });

    certPage.drawText(`Position: ${position}`, {
      x: 50,
      y: height - 195,
      size: 12,
      font: normalFont
    });

    certPage.drawText(`Department: ${department}`, {
      x: 50,
      y: height - 220,
      size: 12,
      font: normalFont
    });

    certPage.drawText(`Application No: ${upload.id}`, {
      x: 50,
      y: height - 245,
      size: 12,
      font: normalFont
    });

    certPage.drawText(`Date: ${new Date().toLocaleDateString('en-US')}`, {
      x: 50,
      y: height - 270,
      size: 12,
      font: normalFont
    });

    // Footer
    certPage.drawText('This document has been officially verified by the Government of Bangladesh', {
      x: 50,
      y: 100,
      size: 10,
      font: normalFont,
      color: rgb(0.5, 0.5, 0.5)
    });

    console.log('✅ Certificate page created');

    // Create signature page (LAST PAGE)
    sigDoc = await PDFDocument.create();
    const sigPage = sigDoc.addPage([612, 792]);
    
    sigPage.drawText('OFFICIAL APPROVAL SIGNATURE', {
      x: 50,
      y: 400,
      size: 18,
      font: boldFont,
      color: rgb(0, 0.5, 0)
    });

    sigPage.drawText(`Verified By: ${req.user.name}`, {
      x: 50,
      y: 350,
      size: 14,
      font: boldFont
    });

    sigPage.drawText(`Position: ${position}`, {
      x: 50,
      y: 325,
      size: 12,
      font: normalFont
    });

    sigPage.drawText(`Date: ${new Date().toLocaleDateString('en-US')}`, {
      x: 50,
      y: 300,
      size: 12,
      font: normalFont
    });

    console.log('✅ Signature page created');

    // Combine PDFs: Certificate + Original + Signature
    combinedDoc = await PDFDocument.create();
    
    // Add certificate page as FIRST page
    const [certPageRef] = await combinedDoc.copyPages(certDoc, [0]);
    combinedDoc.addPage(certPageRef);
    console.log('✅ Certificate page added to combined document');
    
    // Add original pages
    const originalPages = await combinedDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
    for (const page of originalPages) {
      combinedDoc.addPage(page);
    }
    console.log(`✅ Added ${originalPages.length} original pages`);
    
    // Add signature page as LAST page
    const [sigPageRef] = await combinedDoc.copyPages(sigDoc, [0]);
    combinedDoc.addPage(sigPageRef);
    console.log('✅ Signature page added to combined document');
    
    // Save combined PDF
    const combinedPdfBytes = await combinedDoc.save();
    console.log(`✅ Combined PDF created (${combinedPdfBytes.length} bytes)`);
    
    const newFileName = `verified_${upload.id}_${Date.now()}.pdf`;
    const uploadDir = path.join(__dirname, '../', process.env.UPLOAD_DIR || 'uploads');
    const newFilePath = path.join(uploadDir, newFileName);
    
    await fs.writeFile(newFilePath, combinedPdfBytes);
    console.log(`✅ Verified PDF saved to: ${newFilePath}`);
    
    // Update database record
    const verifiedUpload = await pool.query(
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
    
    console.log('✅ Database updated with verification status');
    
    // Delete original file (non-blocking)
    fs.unlink(upload.file_path)
      .then(() => console.log(`✅ Original file deleted: ${upload.file_path}`))
      .catch(err => console.warn(`⚠️ Could not delete original file: ${err.message}`));
    
    res.json({
      message: 'File verified successfully',
      data: verifiedUpload.rows[0]
    });
    
    console.log(`✅✅✅ PDF VERIFICATION COMPLETED SUCCESSFULLY FOR UPLOAD #${id} ✅✅✅`);
    
  } catch (err) {
    console.error('❌❌❌ PDF VERIFICATION FAILED ❌❌❌');
    console.error('Error details:', err);
    console.error('Stack trace:', err.stack);
    
    // Cleanup temporary files if they exist
    try {
      if (originalPdfBytes && !upload?.file_path.includes('verified_')) {
        console.log('⚠️ Original file preserved (not deleted due to error)');
      }
    } catch (cleanupErr) {
      console.warn('Cleanup error:', cleanupErr.message);
    }
    
    res.status(500).json({ 
      message: 'PDF processing failed', 
      error: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

module.exports = router;