// frontend/src/pages/AdminDashboard.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import axios from 'axios';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

const AdminDashboard = () => {
  const { user } = useAuth();
  const [pendingUploads, setPendingUploads] = useState<any[]>([]);
  const [completedUploads, setCompletedUploads] = useState<any[]>([]);
  const [selectedUpload, setSelectedUpload] = useState<any>(null);
  const [certificateData, setCertificateData] = useState({
    name: '',
    position: '',
    department: ''
  });
  const [isVerifying, setIsVerifying] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const token = localStorage.getItem('token');
        
        const [pendingRes, completedRes] = await Promise.all([
          axios.get('/api/files/pending', {
            headers: { 'x-auth-token': token }
          }),
          axios.get('/api/files/completed', {
            headers: { 'x-auth-token': token }
          })
        ]);
        
        setPendingUploads(pendingRes.data);
        setCompletedUploads(completedRes.data);
      } catch (err) {
        console.error('Error fetching data', err);
        toast.error('Failed to load uploads');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleVerifyClick = (upload: any) => {
    setSelectedUpload(upload);
    setCertificateData({
      name: upload.user_name || '',
      position: '',
      department: ''
    });
  };

  const handleVerify = async () => {
    if (!selectedUpload) return;
    
    if (!certificateData.name || !certificateData.position || !certificateData.department) {
      toast.error('All certificate fields are required');
      return;
    }

    setIsVerifying(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(
        `/api/files/verify/${selectedUpload.id}`,
        certificateData,
        {
          headers: {
            'x-auth-token': token
          }
        }
      );
      
      toast.success('File verified successfully!');
      
      // Refresh data
      const pendingRes = await axios.get('/api/files/pending', {
        headers: { 'x-auth-token': token }
      });
      const completedRes = await axios.get('/api/files/completed', {
        headers: { 'x-auth-token': token }
      });
      
      setPendingUploads(pendingRes.data);
      setCompletedUploads(completedRes.data);
      setSelectedUpload(null);
    } catch (error: any) {
      console.error('Verification failed', error);
      toast.error(error.response?.data?.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading uploads...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h1 className="text-2xl font-bold text-green-800 mb-2">অ্যাডমিন ড্যাশবোর্ড</h1>
          <p className="text-gray-600">মোট পেন্ডিং: {pendingUploads.length} | মোট ভেরিফাইড: {completedUploads.length}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Pending Uploads */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-700">পেন্ডিং আবেদন ({pendingUploads.length})</h2>
              <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm">
                অপেক্ষায়
              </span>
            </div>
            
            {pendingUploads.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <div className="text-5xl mb-4">✅</div>
                <h3 className="text-lg font-medium text-gray-700">সকল আবেদন প্রক্রিয়াজাত হয়েছে</h3>
                <p className="text-gray-500 mt-2">নতুন আবেদনের জন্য অপেক্ষা করুন</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="text-left p-3 font-medium text-gray-700">আবেদন নং</th>
                      <th className="text-left p-3 font-medium text-gray-700">ব্যবহারকারী</th>
                      <th className="text-left p-3 font-medium text-gray-700">নথি</th>
                      <th className="text-left p-3 font-medium text-gray-700">তারিখ</th>
                      <th className="text-left p-3 font-medium text-gray-700">কার্যক্রম</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingUploads.map((upload) => (
                      <tr key={upload.id} className="border-t hover:bg-gray-50">
                        <td className="p-3 font-medium">{upload.id}</td>
                        <td className="p-3">
                          <div>{upload.user_name}</div>
                          <div className="text-xs text-gray-500">{upload.user_email}</div>
                        </td>
                        <td className="p-3 max-w-[150px] truncate">{upload.original_filename}</td>
                        <td className="p-3">{new Date(upload.created_at).toLocaleDateString('bn-BD')}</td>
                        <td className="p-3">
                          <button 
                            onClick={() => handleVerifyClick(upload)}
                            className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition text-sm"
                          >
                            ভেরিফাই করুন
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Completed Uploads */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-700">ভেরিফাইড আবেদন ({completedUploads.length})</h2>
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm">
                সম্পন্ন
              </span>
            </div>
            
            {completedUploads.length === 0 ? (
              <div className="text-center py-12 bg-gray-50 rounded-lg">
                <div className="text-5xl mb-4">📁</div>
                <h3 className="text-lg font-medium text-gray-700">এখনো কোনো ভেরিফাইড আবেদন নেই</h3>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[600px]">
                  <thead>
                    <tr className="bg-gray-100">
                      <th className="text-left p-3 font-medium text-gray-700">আবেদন নং</th>
                      <th className="text-left p-3 font-medium text-gray-700">ব্যবহারকারী</th>
                      <th className="text-left p-3 font-medium text-gray-700">অনুমোদনকারী</th>
                      <th className="text-left p-3 font-medium text-gray-700">তারিখ</th>
                      <th className="text-left p-3 font-medium text-gray-700">ডাউনলোড</th>
                    </tr>
                  </thead>
                  <tbody>
                    {completedUploads.map((upload) => (
                      <tr key={upload.id} className="border-t hover:bg-gray-50">
                        <td className="p-3 font-medium">{upload.id}</td>
                        <td className="p-3">{upload.user_name}</td>
                        <td className="p-3">
                          <div>{upload.verified_by_name}</div>
                          <div className="text-xs text-gray-500">{upload.certificate_data?.position}</div>
                        </td>
                        <td className="p-3">{new Date(upload.verified_at).toLocaleDateString('bn-BD')}</td>
                        <td className="p-3">
                          <a 
                            href={`/uploads/${upload.file_path.split('/').pop()}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline text-sm"
                          >
                            ডাউনলোড
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Verification Modal */}
        {selectedUpload && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
              <div className="p-6">
                <h3 className="text-xl font-bold text-gray-800 mb-4">নথি ভেরিফাই করুন</h3>
                
                <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                  <p className="font-medium">নথি:</p>
                  <p className="text-gray-700 truncate">{selectedUpload.original_filename}</p>
                  <p className="text-sm text-gray-500 mt-1">
                    আবেদনকারী: {selectedUpload.user_name}
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      নাম (Name)
                    </label>
                    <input
                      type="text"
                      value={certificateData.name}
                      onChange={(e) => setCertificateData({...certificateData, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="অনুমোদিত ব্যক্তির নাম"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      পদবী (Position)
                    </label>
                    <input
                      type="text"
                      value={certificateData.position}
                      onChange={(e) => setCertificateData({...certificateData, position: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="যেমন: সচিব, পরিচালক ইত্যাদি"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      বিভাগ (Department)
                    </label>
                    <input
                      type="text"
                      value={certificateData.department}
                      onChange={(e) => setCertificateData({...certificateData, department: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="বিভাগের নাম"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3">
                  <button
                    onClick={() => setSelectedUpload(null)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    বাতিল করুন
                  </button>
                  <button
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className={`px-4 py-2 rounded-md text-white ${
                      isVerifying 
                        ? 'bg-green-400 cursor-not-allowed' 
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {isVerifying ? 'প্রক্রিয়াধীন...' : 'অনুমোদন করুন'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
};

export default AdminDashboard;