// frontend/src/pages/AdminDashboard.tsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Header from '../components/Header';
import Footer from '../components/Footer';
import { toast } from 'react-toastify';

const AdminDashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
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
          axios.get('/api/files/pending', { headers: { 'x-auth-token': token } }),
          axios.get('/api/files/completed', { headers: { 'x-auth-token': token } })
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

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

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
        { headers: { 'x-auth-token': token } }
      );
      
      toast.success('ফাইল সফলভাবে যাচাই করা হয়েছে!');
      
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
      toast.error(error.response?.data?.message || 'যাচাইকরণ ব্যর্থ হয়েছে');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDeleteUpload = async (uploadId: number) => {
    if (!window.confirm('আপনি কি নিশ্চিত আপনি এই আবেদনটি মুছে ফেলতে চান? এই কাজটি পূর্বাবস্থায় ফেরানো যাবে না।')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`/api/files/${uploadId}`, {
        headers: { 'x-auth-token': token }
      });
      
      toast.success('আবেদন সফলভাবে মুছে ফেলা হয়েছে!');
      
      // Refresh pending uploads
      const pendingRes = await axios.get('/api/files/pending', {
        headers: { 'x-auth-token': token }
      });
      setPendingUploads(pendingRes.data);
    } catch (error: any) {
      console.error('Delete failed', error);
      toast.error(error.response?.data?.message || 'আবেদন মোছা ব্যর্থ হয়েছে');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 font-medium">তথ্য লোড হচ্ছে...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Header />
      
      {/* Admin Action Bar with Logout */}
      <div className="bg-white border-b border-gray-200 py-4 mb-6 shadow-sm">
        <div className="container mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-green-800 flex items-center gap-3">
              <div className="bg-green-600 text-white p-2 rounded-lg">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              অ্যাডমিন ড্যাশবোর্ড
            </h1>
            <p className="text-gray-600 mt-1">
              মোট পেন্ডিং: <span className="font-bold text-yellow-600">{pendingUploads.length}</span> | 
              মোট যাচাইকৃত: <span className="font-bold text-green-600">{completedUploads.length}</span>
            </p>
          </div>
          
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 bg-red-100 text-red-700 px-5 py-2.5 rounded-lg hover:bg-red-200 transition-colors font-medium group"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>লগআউট</span>
          </button>
        </div>
      </div>

      <main className="container mx-auto px-4 py-2 flex-grow">
        {/* Tables in Row Layout (Stacked) */}
        <div className="space-y-6">
          {/* Pending Uploads Table */}
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="bg-yellow-100 text-yellow-800 text-xs font-medium px-3 py-1 rounded-full">
                  পেন্ডিং
                </span>
                <h2 className="font-bold text-gray-800">অপেক্ষাধীন আবেদন ({pendingUploads.length})</h2>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">আবেদন নং</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ব্যবহারকারী</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">নথি</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">তারিখ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">কার্যক্রম</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pendingUploads.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                        <div className="text-4xl mb-2">✅</div>
                        <p className="font-medium">সকল আবেদন প্রক্রিয়াজাত হয়েছে</p>
                      </td>
                    </tr>
                  ) : (
                    pendingUploads.map((upload) => (
                      <tr key={upload.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{upload.id}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{upload.user_name}</div>
                          <div className="text-xs text-gray-500">{upload.user_email}</div>
                        </td>
                        <td className="px-4 py-3 max-w-[120px] truncate text-gray-700">
                          {upload.original_filename}
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {new Date(upload.created_at).toLocaleDateString('bn-BD')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleVerifyClick(upload)}
                              className="px-3 py-1 border border-green-600 text-green-700 text-xs font-medium rounded-full bg-green-50 hover:bg-green-100 transition-colors"
                            >
                              যাচাই করুন
                            </button>
                            <button
                              onClick={() => handleDeleteUpload(upload.id)}
                              className="px-3 py-1 border border-red-600 text-red-700 text-xs font-medium rounded-full bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1"
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                              মুছুন
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Completed Uploads Table */}
          <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
            <div className="p-5 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="bg-green-100 text-green-800 text-xs font-medium px-3 py-1 rounded-full">
                  সম্পন্ন
                </span>
                <h2 className="font-bold text-gray-800">যাচাইকৃত আবেদন ({completedUploads.length})</h2>
              </div>
            </div>
            
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">আবেদন নং</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ব্যবহারকারী</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">অনুমোদনকারী</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">তারিখ</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ডাউনলোড</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {completedUploads.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                        <div className="text-4xl mb-2">📁</div>
                        <p className="font-medium">এখনো কোনো যাচাইকৃত আবেদন নেই</p>
                      </td>
                    </tr>
                  ) : (
                    completedUploads.map((upload) => (
                      <tr key={upload.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{upload.id}</td>
                        <td className="px-4 py-3 text-gray-700">{upload.user_name}</td>
                        <td className="px-4 py-3">
                          <div className="font-medium">{upload.verified_by_name}</div>
                          <div className="text-xs text-gray-500">{upload.certificate_data?.position || 'N/A'}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600 text-sm">
                          {new Date(upload.verified_at).toLocaleDateString('bn-BD')}
                        </td>
                        <td className="px-4 py-3">
                          <a 
                            href={`http://localhost:5000/uploads/${upload.file_path.split('/').pop()}`} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-3 py-1 border border-blue-600 text-blue-700 text-xs font-medium rounded-full bg-blue-50 hover:bg-blue-100 transition-colors"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            ডাউনলোড
                          </a>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Verification Modal */}
        {selectedUpload && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-bold text-gray-800">নথি যাচাই করুন</h3>
                  <button 
                    onClick={() => setSelectedUpload(null)}
                    className="text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <div className="mb-5 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="font-medium text-gray-800 mb-1">নথি:</p>
                  <p className="text-gray-700 truncate">{selectedUpload.original_filename}</p>
                  <p className="text-sm text-gray-600 mt-1">
                    আবেদনকারী: <span className="font-medium">{selectedUpload.user_name}</span>
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      নাম (Name) *
                    </label>
                    <input
                      type="text"
                      value={certificateData.name}
                      onChange={(e) => setCertificateData({...certificateData, name: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="অনুমোদিত ব্যক্তির নাম (ইংরেজিতে)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      পদবী (Position) *
                    </label>
                    <input
                      type="text"
                      value={certificateData.position}
                      onChange={(e) => setCertificateData({...certificateData, position: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="যেমন: Director, Secretary (ইংরেজিতে)"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      বিভাগ (Department) *
                    </label>
                    <input
                      type="text"
                      value={certificateData.department}
                      onChange={(e) => setCertificateData({...certificateData, department: e.target.value})}
                      className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      placeholder="বিভাগের নাম (ইংরেজিতে)"
                    />
                  </div>
                </div>

                <div className="mt-6 flex justify-end space-x-3 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setSelectedUpload(null)}
                    className="px-5 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors font-medium"
                  >
                    বাতিল করুন
                  </button>
                  <button
                    onClick={handleVerify}
                    disabled={isVerifying}
                    className={`px-5 py-2.5 rounded-lg text-white font-medium flex items-center gap-2 ${
                      isVerifying 
                        ? 'bg-green-400 cursor-not-allowed' 
                        : 'bg-green-600 hover:bg-green-700'
                    }`}
                  >
                    {isVerifying ? (
                      <>
                        <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        প্রক্রিয়াধীন...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        অনুমোদন করুন
                      </>
                    )}
                  </button>
                </div>
                
                <p className="mt-3 text-xs text-yellow-600 bg-yellow-50 p-2 rounded-lg border border-yellow-200">
                  ⚠️ <strong>গুরুত্বপূর্ণ:</strong> দয়া করে শুধুমাত্র ইংরেজি অক্ষর ব্যবহার করুন (বাংলা অক্ষর সমর্থিত নয়)
                </p>
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