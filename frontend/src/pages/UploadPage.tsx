// frontend/src/pages/UploadPage.tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import axios from 'axios';
import { toast } from 'react-toastify';
import Header from '../components/Header';
import Footer from '../components/Footer';

const UploadPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const dropZoneRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // GSAP animations on mount
  useEffect(() => {
    gsap.fromTo('.upload-container',
      { opacity: 0, y: 30 },
      { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }
    );
    
    gsap.fromTo('.drop-zone',
      { scale: 0.95, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.5, delay: 0.2, ease: 'back.out(1.7)' }
    );
  }, []);

  // Handle file selection
  const handleFileSelect = (file: File) => {
    if (file.type !== 'image/png' && file.type !== 'image/jpeg') {
      toast.error('শুধুমাত্র PNG এবং JPEG ফাইল অনুমোদিত!');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast.error('ফাইলের আকার 5MB এর কম হতে হবে!');
      return;
    }

    setSelectedFile(file);
    
    // Animate file preview
    gsap.fromTo('.file-preview',
      { scale: 0.8, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.4, ease: 'power2.out' }
    );
  };

  // Handle file drop
  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  // Handle file input change
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileSelect(e.target.files[0]);
    }
  };

  // Handle upload
  const handleUpload = async () => {
    if (!selectedFile) return;

    const formData = new FormData();
    formData.append('file', selectedFile);

    setIsUploading(true);
    try {
      await axios.post('/api/files/upload', formData);
      toast.success('ফাইল সফলভাবে আপলোড হয়েছে! আপনার আবেদন পেন্ডিং অবস্থায় রয়েছে।');
      
      // Navigate back to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    } catch (error: any) {
      console.error('Upload failed', error);
      toast.error(error.response?.data?.message || 'আপলোড ব্যর্থ হয়েছে');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle drag events
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!isDragging) {
      setIsDragging(true);
      gsap.to(dropZoneRef.current, { scale: 1.03, duration: 0.3, ease: 'power1.out' });
    }
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    gsap.to(dropZoneRef.current, { scale: 1, duration: 0.3, ease: 'power1.out' });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Action Bar with text on left and buttons on right */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8 border border-gray-200">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Left Side - Text Content */}
            <div className="flex-1 min-w-[250px]">
              <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-3">
                <div className="bg-green-600 text-white p-2.5 rounded-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                </div>
                নতুন আবেদন তৈরি করুন
              </h1>
              <p className="text-gray-600 mt-2 text-lg">
                অ্যাপোস্টিল করার জন্য আপনার নথি আপলোড করুন
              </p>
            </div>
            
            {/* Right Side - Action Buttons */}
            <div className="flex gap-3">
              {/* Go Back Button */}
              <button 
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-2 text-gray-700 hover:text-green-600 transition-colors font-medium bg-gray-100 px-5 py-2.5 rounded-lg hover:bg-green-50 group"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                <span>ড্যাশবোর্ডে ফিরে যান</span>
              </button>
              
              {/* Contact Button */}
              <button 
                onClick={() => toast.info('যোগাযোগ বিভাগ: ফোন: ১৬১২২, ইমেইল: support@gov.bd', {
                  autoClose: 5000
                })}
                className="flex items-center gap-2 border border-green-600 text-green-600 px-5 py-2.5 rounded-lg hover:bg-green-50 transition-colors group"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                </svg>
                <span>যোগাযোগ</span>
              </button>
            </div>
          </div>
        </div>

        {/* Upload Container - Same width as action bar */}
        <div className="bg-white rounded-lg shadow-md p-8 border border-gray-200">
          <div 
            ref={dropZoneRef}
            className={`drop-zone border-4 border-dashed rounded-2xl p-16 text-center transition-all duration-300 ${
              isDragging 
                ? 'border-green-500 bg-green-50 animate-pulse' 
                : 'border-gray-300 bg-white hover:border-green-400 hover:bg-gray-50'
            }`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/png, image/jpeg"
              onChange={handleFileInputChange}
              onClick={(e) => (e.target as HTMLInputElement).value = ''}
            />
            
            {!selectedFile ? (
              <>
                <div className="mx-auto w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                </div>
                
                <h2 className="text-2xl font-bold text-gray-800 mb-3">ফাইল আপলোড করুন</h2>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  আপনার ফাইলটি এখানে টেনে আনুন অথবা ক্লিক করে ফাইল নির্বাচন করুন
                </p>
                
                <div className="flex justify-center">
                  <button className="bg-green-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-green-700 transition-colors shadow-md hover:shadow-lg transform hover:-translate-y-1">
                    ফাইল নির্বাচন করুন
                  </button>
                </div>
                
                <p className="text-gray-500 text-sm mt-4">
                  সমর্থিত ফর্ম্যাট: PNG, JPG | সর্বোচ্চ আকার: 5MB
                </p>
              </>
            ) : (
              <div className="file-preview">
                <div className="mx-auto w-20 h-20 bg-blue-100 rounded-xl flex items-center justify-center mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                
                <h3 className="text-xl font-bold text-gray-800 mb-2 truncate max-w-xs mx-auto">
                  {selectedFile.name}
                </h3>
                <p className="text-gray-600 mb-6">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
                
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    বাতিল করুন
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUpload();
                    }}
                    disabled={isUploading}
                    className={`px-6 py-2 rounded-lg font-medium text-white transition-colors flex items-center gap-2 ${
                      isUploading 
                        ? 'bg-gray-400 cursor-not-allowed' 
                        : 'bg-green-600 hover:bg-green-700 shadow-md hover:shadow-lg'
                    }`}
                  >
                    {isUploading ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        জমা দেওয়া হচ্ছে...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                        </svg>
                        <span>জমা দেওয়ার নিশ্চিতকরণ</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default UploadPage;