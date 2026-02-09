import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const UserDashboard = () => {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<any[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const fetchUploads = async () => {
      try {
        const res = await axios.get('/api/files/my-uploads');
        setUploads(res.data);
      } catch (err) {
        console.error('Error fetching uploads', err);
      }
    };

    fetchUploads();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Please select a file');
      return;
    }

    if (selectedFile.type !== 'application/pdf') {
      toast.error('Only PDF files are allowed');
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    setIsUploading(true);
    try {
      const res = await axios.post('/api/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'x-auth-token': localStorage.getItem('token')
        }
      });
      
      toast.success('File uploaded successfully!');
      // Refresh uploads
      const resUploads = await axios.get('/api/files/my-uploads');
      setUploads(resUploads.data);
      setSelectedFile(null);
    } catch (error: any) {
      console.error('Upload failed', error);
      toast.error(error.response?.data?.message || 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h2 className="text-xl font-bold text-gray-700 mb-4">সকল আবেদন</h2>
          
          {uploads.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <div className="text-4xl mb-4">📁</div>
              <h3 className="text-lg font-medium text-gray-700">এখনো কোনো আবেদন নেই</h3>
              <p className="text-gray-500 mt-2">
                আপনার প্রথম আবেদন জমা দিন
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="text-left p-3 font-medium text-gray-700">আবেদন নং</th>
                    <th className="text-left p-3 font-medium text-gray-700">অবস্থা</th>
                    <th className="text-left p-3 font-medium text-gray-700">নথি</th>
                    <th className="text-left p-3 font-medium text-gray-700">জমা দেওয়ার তারিখ</th>
                    <th className="text-left p-3 font-medium text-gray-700">সর্বশেষ হালনাগাদ</th>
                    <th className="text-left p-3 font-medium text-gray-700">কার্যক্রম</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((upload) => (
                    <tr key={upload.id} className="border-t">
                      <td className="p-3">{upload.id}</td>
                      <td className="p-3">
                        <span className={`px-2 py-1 rounded text-xs ${
                          upload.status === 'pending' 
                            ? 'bg-yellow-100 text-yellow-800' 
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {upload.status === 'pending' ? 'পেন্ডিং' : 'ভেরিফাইড'}
                        </span>
                      </td>
                      <td className="p-3">{upload.original_filename}</td>
                      <td className="p-3">{new Date(upload.created_at).toLocaleDateString('bn-BD')}</td>
                      <td className="p-3">
                        {upload.verified_at 
                          ? new Date(upload.verified_at).toLocaleString('bn-BD')
                          : 'না'}
                      </td>
                      <td className="p-3">
                        {upload.status === 'pending' ? (
                          <span className="text-gray-500">অপেক্ষায়</span>
                        ) : (
                          <a 
                            href={upload.file_path} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            ডাউনলোড
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-white p-6 rounded-lg shadow">
          <h2 className="text-xl font-bold text-gray-700 mb-4">নতুন আবেদন তৈরি করুন</h2>
          
          <div className="border-2 border-dashed rounded-lg p-8 text-center">
            <div className="text-4xl mb-4">📁</div>
            <h3 className="text-lg font-medium text-gray-700">
              আপলোড করতে ক্লিক করুন অথবা এখানে টেনে আনুন
            </h3>
            <p className="text-gray-500 mt-2">
              অনুমোদিত ফাইল: PDF (সর্বোচ্চ 5MB)
            </p>
            
            <input 
              type="file" 
              accept=".pdf" 
              className="hidden" 
              id="file-upload" 
              onChange={handleFileChange} 
            />
            
            <label 
              htmlFor="file-upload" 
              className="mt-4 inline-block bg-green-600 text-white px-6 py-3 rounded-md cursor-pointer hover:bg-green-700 transition"
            >
              আবেদন জমা দিন
            </label>
            
            {selectedFile && (
              <div className="mt-4">
                <p className="text-gray-700">Selected file: {selectedFile.name}</p>
                <button 
                  onClick={handleUpload}
                  disabled={isUploading}
                  className={`mt-2 px-6 py-2 rounded-md text-white ${
                    isUploading 
                      ? 'bg-gray-400 cursor-not-allowed' 
                      : 'bg-blue-600 hover:bg-blue-700'
                  }`}
                >
                  {isUploading ? 'আপলোড হচ্ছে...' : 'আপলোড করুন'}
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default UserDashboard;