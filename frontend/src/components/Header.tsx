import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Link, useNavigate } from 'react-router-dom';

const Header = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="container mx-auto px-4 py-3 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          <img 
            src="https://www.bangladesh.gov.bd/sites/default/files/2022-12/logo.png" 
            alt="Government Logo" 
            className="h-10"
          />
          <div>
            <h1 className="text-xl font-bold text-green-800">ড্যাশবোর্ড</h1>
            <p className="text-sm text-gray-500">গণপ্রজাতন্ত্রী বাংলাদেশ সরকার</p>
          </div>
        </div>
        
        <div className="flex space-x-2">
          <Link to="/new-application" className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition">
            নতুন আবেদন
          </Link>
          <Link to="/contact" className="border border-green-600 text-green-600 px-4 py-2 rounded-md hover:bg-green-50 transition">
            যোগাযোগ
          </Link>
          <Link to="/help" className="border border-green-600 text-green-600 px-4 py-2 rounded-md hover:bg-green-50 transition">
            পাসওয়ার্ড পরিবর্তন
          </Link>
          <button 
            onClick={handleLogout}
            className="bg-red-100 text-red-600 px-4 py-2 rounded-md hover:bg-red-200 transition"
          >
            লগআউট
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;