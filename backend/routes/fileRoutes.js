// backend/routes/fileRoutes.js (FULL VERSION)
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken, authorizeRole } = require('../middleware/auth');
const pool = require('../config/db');

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '../', process.env.UPLOAD_DIR || 'uploads'));
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
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

// Upload file (user only)
router.post('/upload', verifyToken, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

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
    res.status(500).json({ message: 'Server error during upload' });
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
    console.error(err.message);
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
    console.error(err.message);
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
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Verify file (admin only) - PDF processing with certificate + signature
router.post('/verify/:id', verifyToken, authorizeRole('admin'), async (req, res) => {
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

    // Read original PDF
    const originalPdfBytes = fs.readFileSync(upload.file_path);
    const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
    const pdfDoc = await PDFDocument.load(originalPdfBytes);

    // Create certificate page
    const certDoc = await PDFDocument.create();
    const certPage = certDoc.addPage([600, 800]);
    const { width, height } = certPage.getSize();
    const font = await certDoc.embedFont(StandardFonts.HelveticaBold);
    const normalFont = await certDoc.embedFont(StandardFonts.Helvetica);

    // Government header
    certPage.drawText('গণপ্রজাতন্ত্রী বাংলাদেশ সরকার', {
      x: 50,
      y: height - 60,
      size: 28,
      font: font,
      color: rgb(0, 0.5, 0)
    });

    certPage.drawText('অনুমোদিত সনদ', {
      x: 50,
      y: height - 100,
      size: 24,
      font: font,
      color: rgb(0, 0.5, 0)
    });

    // Certificate details
    certPage.drawText('নথির বিবরণ:', {
      x: 50,
      y: height - 150,
      size: 16,
      font: normalFont,
      color: rgb(0, 0, 0)
    });

    certPage.drawText(`নাম: ${name}`, {
      x: 50,
      y: height - 180,
      size: 14,
      font: normalFont
    });

    certPage.drawText(`পদবী: ${position}`, {
      x: 50,
      y: height - 205,
      size: 14,
      font: normalFont
    });

    certPage.drawText(`বিভাগ: ${department}`, {
      x: 50,
      y: height - 230,
      size: 14,
      font: normalFont
    });

    certPage.drawText(`আবেদন নং: ${upload.id}`, {
      x: 50,
      y: height - 255,
      size: 14,
      font: normalFont
    });

    certPage.drawText(`তারিখ: ${new Date().toLocaleDateString('bn-BD')}`, {
      x: 50,
      y: height - 280,
      size: 14,
      font: normalFont
    });

    // Footer
    certPage.drawText('এই নথিটি সরকারি ভাবে অনুমোদিত', {
      x: 50,
      y: 100,
      size: 14,
      font: normalFont,
      color: rgb(0.5, 0.5, 0.5)
    });

    // Create signature page
    const sigDoc = await PDFDocument.create();
    const sigPage = sigDoc.addPage([600, 800]);
    const sigFont = await sigDoc.embedFont(StandardFonts.Helvetica);

    sigPage.drawText('অনুমোদন স্বাক্ষর', {
      x: 50,
      y: 400,
      size: 20,
      font: sigFont,
      color: rgb(0, 0.5, 0)
    });

    sigPage.drawText(`নাম: ${req.user.name}`, {
      x: 50,
      y: 350,
      size: 16,
      font: sigFont
    });

    sigPage.drawText(`পদবী: ${position}`, {
      x: 50,
      y: 320,
      size: 14,
      font: sigFont
    });

    sigPage.drawText(`তারিখ: ${new Date().toLocaleDateString('bn-BD')}`, {
      x: 50,
      y: 290,
      size: 14,
      font: sigFont
    });

    // Combine PDFs: Certificate + Original + Signature
    const combinedDoc = await PDFDocument.create();
    
    // Add certificate page
    const [certPageRef] = await combinedDoc.copyPages(certDoc, [0]);
    combinedDoc.addPage(certPageRef);
    
    // Add original pages
    const originalPages = await combinedDoc.copyPages(pdfDoc, pdfDoc.getPageIndices());
    for (const page of originalPages) {
      combinedDoc.addPage(page);
    }
    
    // Add signature page
    const [sigPageRef] = await combinedDoc.copyPages(sigDoc, [0]);
    combinedDoc.addPage(sigPageRef);
    
    // Save combined PDF
    const combinedPdfBytes = await combinedDoc.save();
    const newFileName = `verified_${upload.id}_${Date.now()}.pdf`;
    const newFilePath = path.join(__dirname, '../', process.env.UPLOAD_DIR || 'uploads', newFileName);
    fs.writeFileSync(newFilePath, combinedPdfBytes);
    
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
    
    // Delete original file
    try {
      fs.unlinkSync(upload.file_path);
    } catch (err) {
      console.warn('Could not delete original file:', err.message);
    }
    
    res.json({
      message: 'File verified successfully',
      data: verifiedUpload.rows[0]
    });
  } catch (err) {
    console.error('Verification error:', err);
    res.status(500).json({ 
      message: 'PDF processing failed', 
      error: err.message 
    });
  }
});

module.exports = router;