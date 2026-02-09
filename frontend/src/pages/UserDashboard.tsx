// frontend/src/pages/UserDashboard.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import Header from '../components/Header';
import Footer from '../components/Footer';
import ActionBar from '../components/ActionBar';
import { toast, ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { gsap } from 'gsap';

const UserDashboard = () => {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUploadToast, setShowUploadToast] = useState(false);
  const uploadToastRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchUploads();
    
    // Poll for updates every 30 seconds
    const interval = setInterval(() => {
      fetchUploads();
    }, 30000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Set up event listener for upload toast
    const handleShowUploadToast = () => {
      setShowUploadToast(true);
      
      // Animate the toast
      gsap.fromTo(uploadToastRef.current,
        { opacity: 0, y: 50 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' }
      );
    };
    
    document.addEventListener('showUploadToast', handleShowUploadToast);
    
    return () => {
      document.removeEventListener('showUploadToast', handleShowUploadToast);
    };
  }, []);

  const fetchUploads = async () => {
    try {
      const res = await axios.get('/api/files/my-uploads');
      setUploads(res.data);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching uploads:', err);
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) {
      setShowUploadToast(false);
      return;
    }

    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);

    try {
      await axios.post('/api/files/upload', formData);
      toast.success('File uploaded successfully!');
      setShowUploadToast(false);
      fetchUploads(); // Refresh uploads list
    } catch (error: any) {
      console.error('Upload failed', error);
      toast.error(error.response?.data?.message || 'Upload failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {/* Action Bar - This is the interactive bar over the table */}
        <ActionBar />
        
        {/* Dashboard Card */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-100">
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              <span>📄</span>
              সকল আবেদন
            </h2>
          </div>
          
          {uploads.length === 0 && (
            <div className="text-center py-16 bg-gray-50 rounded-lg border-2 border-dashed border-gray-200">
              <div className="text-6xl mb-4">📁</div>
              <h3 className="text-2xl font-bold text-gray-800 mb-3">
                এখনো কোনো আবেদন নেই
              </h3>
              <p className="text-gray-600 max-w-md mx-auto mb-6">
                আপনার প্রথম আবেদন জমা দিন "নতুন আবেদন" বাটনে ক্লিক করুন
              </p>
            </div>
          )}
          
          {uploads.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left p-4 font-medium text-gray-700">আবেদন নং</th>
                    <th className="text-left p-4 font-medium text-gray-700">অবস্থা</th>
                    <th className="text-left p-4 font-medium text-gray-700">নথি</th>
                    <th className="text-left p-4 font-medium text-gray-700">জমা দেওয়ার তারিখ</th>
                    <th className="text-left p-4 font-medium text-gray-700">সর্বশেষ হালনাগাদ</th>
                    <th className="text-left p-4 font-medium text-gray-700">কার্যক্রম</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((upload) => (
                    <tr 
                      key={upload.id} 
                      className="border-b border-gray-100 hover:bg-gray-50 transition-colors"
                    >
                      <td className="p-4 font-medium text-gray-900">{upload.id}</td>
                      <td className="p-4">
                        <span className="px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
                          পেন্ডিং
                        </span>
                      </td>
                      <td className="p-4 max-w-xs truncate text-gray-700">
                        {upload.original_filename}
                      </td>
                      <td className="p-4 text-gray-600">
                        {new Date(upload.created_at).toLocaleDateString('bn-BD')}
                      </td>
                      <td className="p-4 text-gray-600">
                        না
                      </td>
                      <td className="p-4">
                        <span className="text-gray-400">অপেক্ষায়</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Toast Notification for Upload */}
      {showUploadToast && (
        <div 
          ref={uploadToastRef}
          className="fixed bottom-8 left-1/2 transform -translate-x-1/2 w-96 z-50"
        >
          <div className="bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-bold text-lg text-gray-800">ফাইল আপলোড করুন</h3>
              <p className="text-gray-600 text-sm mt-1">PNG বা JPG ফর্ম্যাটে আপলোড করুন (সর্বোচ্চ 5MB)</p>
            </div>
            
            <div className="p-4">
              <input 
                type="file" 
                accept="image/png, image/jpeg" 
                className="w-full mb-4"
                onChange={handleFileUpload}
                onClick={(e) => {
                  // Reset input on click to allow re-uploading same file
                  (e.target as HTMLInputElement).value = '';
                }}
              />
              <button 
                onClick={() => setShowUploadToast(false)}
                className="w-full bg-gray-100 text-gray-700 py-2 rounded-md hover:bg-gray-200 transition-colors"
              >
                বন্ধ করুন
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
      <ToastContainer position="top-center" autoClose={3000} hideProgressBar={false} />
    </div>
  );
};

export default UserDashboard;