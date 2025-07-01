import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

function App() {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedImages, setSelectedImages] = useState([]);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Other');
  const [categories, setCategories] = useState(['Other']);
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState({ 
    total_files: 0, 
    total_downloads: 0,
    category_stats: [],
    popular_files: []
  });
  const [message, setMessage] = useState('');
  const [viewMode, setViewMode] = useState('grid'); // grid or list
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedFileType, setSelectedFileType] = useState('All');
  const [sortBy, setSortBy] = useState('upload_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [isSearching, setIsSearching] = useState(false);

  // Image gallery modal state
  const [selectedImageModal, setSelectedImageModal] = useState(null);

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

  // Fetch categories on component mount
  useEffect(() => {
    fetchCategories();
    fetchFiles();
    fetchStats();
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchTerm || selectedCategory !== 'All' || selectedFileType !== 'All') {
        searchFiles();
      } else {
        fetchFiles();
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, selectedCategory, selectedFileType, sortBy, sortOrder]);

  const fetchCategories = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/categories`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/files`);
      if (response.ok) {
        const data = await response.json();
        setFiles(data);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      setMessage('Error loading files');
    }
  };

  const searchFiles = async () => {
    setIsSearching(true);
    try {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (selectedCategory !== 'All') params.append('category', selectedCategory);
      if (selectedFileType !== 'All') params.append('file_type', selectedFileType);
      params.append('sort_by', sortBy);
      params.append('sort_order', sortOrder);

      const response = await fetch(`${backendUrl}/api/files/search?${params}`);
      if (response.ok) {
        const data = await response.json();
        setFiles(data);
      }
    } catch (error) {
      console.error('Error searching files:', error);
      setMessage('Error searching files');
    } finally {
      setIsSearching(false);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${backendUrl}/api/stats`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    setSelectedFile(file);
    setMessage('');
  };

  const handleImageSelect = (event) => {
    const files = Array.from(event.target.files);
    if (files.length > 5) {
      setMessage('Maximum 5 images allowed');
      return;
    }
    setSelectedImages(files);
    setMessage('');
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage('Please select a file first');
      return;
    }

    setUploading(true);
    setMessage('');

    const formData = new FormData();
    formData.append('file', selectedFile);
    if (description) {
      formData.append('description', description);
    }
    formData.append('category', category);
    
    // Add images
    selectedImages.forEach((image, index) => {
      formData.append('images', image);
    });

    try {
      const response = await fetch(`${backendUrl}/api/files/upload`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setMessage('File uploaded successfully!');
        setSelectedFile(null);
        setSelectedImages([]);
        setDescription('');
        setCategory('Other');
        document.getElementById('fileInput').value = '';
        document.getElementById('imageInput').value = '';
        fetchFiles();
        fetchStats();
      } else {
        setMessage(`Upload failed: ${result.detail}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      setMessage('Upload failed: Network error');
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (fileId, fileName) => {
    try {
      const response = await fetch(`${backendUrl}/api/files/download/${fileId}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        // Refresh stats after download
        fetchStats();
      } else {
        setMessage('Download failed');
      }
    } catch (error) {
      console.error('Download error:', error);
      setMessage('Download failed: Network error');
    }
  };

  const handleDelete = async (fileId) => {
    if (!window.confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      console.log('Starting delete for file ID:', fileId);
      const response = await fetch(`${backendUrl}/api/files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      console.log('Delete response status:', response.status);
      const result = await response.json();
      console.log('Delete response data:', result);

      if (response.ok && result.success) {
        setMessage('File deleted successfully');
        // Force refresh the file list
        await fetchFiles();
        await fetchStats();
      } else {
        setMessage(`Delete failed: ${result.message || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Delete error:', error);
      setMessage(`Delete failed: ${error.message}`);
    }
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedCategory('All');
    setSelectedFileType('All');
    setSortBy('upload_date');
    setSortOrder('desc');
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getCategoryColor = (category) => {
    const colors = {
      'Games': 'bg-purple-100 text-purple-800',
      'Utilities': 'bg-blue-100 text-blue-800',
      'Development Tools': 'bg-green-100 text-green-800',
      'Multimedia': 'bg-pink-100 text-pink-800',
      'Security': 'bg-red-100 text-red-800',
      'Business': 'bg-yellow-100 text-yellow-800',
      'Education': 'bg-indigo-100 text-indigo-800',
      'Internet': 'bg-cyan-100 text-cyan-800',
      'System Tools': 'bg-gray-100 text-gray-800',
      'Graphics': 'bg-orange-100 text-orange-800',
      'Office': 'bg-teal-100 text-teal-800',
      'Other': 'bg-gray-100 text-gray-600'
    };
    return colors[category] || colors['Other'];
  };

  const getFileIcon = (fileName) => {
    const extension = fileName.split('.').pop().toLowerCase();
    switch (extension) {
      case 'exe':
      case 'msi':
        return '🖥️';
      case 'apk':
        return '📱';
      case 'dmg':
        return '🍎';
      case 'zip':
      case 'tar':
      case 'gz':
        return '📦';
      case 'deb':
      case 'rpm':
        return '🐧';
      default:
        return '💾';
    }
  };

  const ImageModal = ({ image, onClose }) => {
    if (!image) return null;
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="relative max-w-4xl max-h-full">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white text-2xl bg-black bg-opacity-50 rounded-full w-10 h-10 flex items-center justify-center hover:bg-opacity-75"
          >
            ×
          </button>
          <img
            src={`${backendUrl}${image.url}`}
            alt="Software Screenshot"
            className="max-w-full max-h-full object-contain rounded-lg"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="relative bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-800 text-white overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 bg-black opacity-50"></div>
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }}></div>
        
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between">
            {/* Left Side - Branding */}
            <div className="flex-1 mb-6 lg:mb-0">
              <div className="flex items-center space-x-4 mb-3">
                <div className="flex items-center justify-center w-12 h-12 bg-white bg-opacity-20 rounded-xl backdrop-blur-sm">
                  <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-3xl lg:text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-blue-200">
                    SoftHub
                  </h1>
                  <div className="text-blue-100 text-sm font-medium">
                    Software Distribution Platform
                  </div>
                </div>
              </div>
              <p className="text-blue-100 text-lg max-w-2xl leading-relaxed">
                🚀 Upload, organize and distribute your software with professional visual showcase. 
                <span className="text-yellow-300 font-semibold"> The modern way to share software.</span>
              </p>
            </div>

            {/* Right Side - Statistics */}
            <div className="lg:flex-shrink-0">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                {/* Total Files Card */}
                <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-xl p-4 text-center border border-white border-opacity-20 hover:bg-opacity-20 transition-all duration-300">
                  <div className="flex items-center justify-center w-10 h-10 bg-blue-500 bg-opacity-30 rounded-lg mx-auto mb-2">
                    <svg className="w-6 h-6 text-blue-200" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm0 2h12v8H4V6z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-2xl lg:text-3xl font-bold text-white mb-1">
                    {stats.total_files}
                  </div>
                  <div className="text-blue-200 text-sm font-medium">
                    Software Files
                  </div>
                </div>

                {/* Total Downloads Card */}
                <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-xl p-4 text-center border border-white border-opacity-20 hover:bg-opacity-20 transition-all duration-300">
                  <div className="flex items-center justify-center w-10 h-10 bg-green-500 bg-opacity-30 rounded-lg mx-auto mb-2">
                    <svg className="w-6 h-6 text-green-200" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </div>
                  <div className="text-2xl lg:text-3xl font-bold text-white mb-1">
                    {stats.total_downloads}
                  </div>
                  <div className="text-green-200 text-sm font-medium">
                    Total Downloads
                  </div>
                </div>

                {/* Categories Card */}
                <div className="bg-white bg-opacity-10 backdrop-blur-sm rounded-xl p-4 text-center border border-white border-opacity-20 hover:bg-opacity-20 transition-all duration-300 col-span-2 lg:col-span-1">
                  <div className="flex items-center justify-center w-10 h-10 bg-purple-500 bg-opacity-30 rounded-lg mx-auto mb-2">
                    <svg className="w-6 h-6 text-purple-200" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
                    </svg>
                  </div>
                  <div className="text-2xl lg:text-3xl font-bold text-white mb-1">
                    {stats.category_stats ? stats.category_stats.length : 0}
                  </div>
                  <div className="text-purple-200 text-sm font-medium">
                    Categories
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <div className="mt-6 flex flex-wrap gap-3">
                <button 
                  onClick={() => document.getElementById('fileInput')?.focus()}
                  className="px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm rounded-lg text-white text-sm font-medium border border-white border-opacity-30 transition-all duration-300 flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  <span>Quick Upload</span>
                </button>
                <button 
                  onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
                  className="px-4 py-2 bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm rounded-lg text-white text-sm font-medium border border-white border-opacity-30 transition-all duration-300 flex items-center space-x-2"
                >
                  {viewMode === 'grid' ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 8a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 12a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                    </svg>
                  )}
                  <span>{viewMode === 'grid' ? 'List View' : 'Grid View'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Bottom Stats Bar - Popular Categories */}
          {stats.category_stats && stats.category_stats.length > 0 && (
            <div className="mt-8 pt-6 border-t border-white border-opacity-20">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="text-blue-200 text-sm font-medium flex items-center space-x-2">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M12 7a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0V8.414l-4.293 4.293a1 1 0 01-1.414 0L8 10.414l-4.293 4.293a1 1 0 01-1.414-1.414l5-5a1 1 0 011.414 0L11 10.586 14.586 7H12z" clipRule="evenodd" />
                  </svg>
                  <span>Popular Categories:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {stats.category_stats.slice(0, 4).map((stat) => (
                    <button
                      key={stat._id}
                      onClick={() => setSelectedCategory(stat._id)}
                      className="px-3 py-1 bg-white bg-opacity-20 hover:bg-opacity-30 backdrop-blur-sm rounded-full text-white text-xs font-medium border border-white border-opacity-30 transition-all duration-300 flex items-center space-x-1"
                    >
                      <span>{stat._id}</span>
                      <span className="bg-white bg-opacity-30 rounded-full px-2 py-0.5 text-xs">
                        {stat.count}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Animated Elements */}
        <div className="absolute top-0 right-0 -mt-16 -mr-16 w-32 h-32 bg-gradient-to-br from-blue-400 to-purple-600 rounded-full opacity-20 animate-pulse"></div>
        <div className="absolute bottom-0 left-0 -mb-8 -ml-8 w-24 h-24 bg-gradient-to-br from-pink-400 to-red-600 rounded-full opacity-20 animate-bounce"></div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Upload Software</h2>
          </div>
          <div className="p-6">
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Software File
                  </label>
                  <input
                    id="fileInput"
                    type="file"
                    onChange={handleFileSelect}
                    accept=".exe,.msi,.dmg,.apk,.deb,.rpm,.zip,.tar.gz,.tar.xz"
                    className="block w-full text-sm text-gray-500
                      file:mr-4 file:py-2 file:px-4
                      file:rounded-full file:border-0
                      file:text-sm file:font-semibold
                      file:bg-blue-50 file:text-blue-700
                      hover:file:bg-blue-100
                      cursor-pointer"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md 
                      focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    {categories.map((cat) => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Screenshots (Optional - Max 5 images)
                </label>
                <input
                  id="imageInput"
                  type="file"
                  multiple
                  onChange={handleImageSelect}
                  accept=".jpg,.jpeg,.png,.gif,.webp"
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-full file:border-0
                    file:text-sm file:font-semibold
                    file:bg-green-50 file:text-green-700
                    hover:file:bg-green-100
                    cursor-pointer"
                />
                {selectedImages.length > 0 && (
                  <div className="mt-2 text-sm text-gray-600">
                    {selectedImages.length} image(s) selected
                  </div>
                )}
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Description (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter software description, features, requirements..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md 
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows="4"
                />
              </div>

              <button
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-medium
                  hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed
                  transition-colors duration-200 flex items-center"
              >
                {uploading ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Uploading...
                  </>
                ) : (
                  'Upload Software'
                )}
              </button>
            </div>

            {message && (
              <div className={`mt-4 p-3 rounded-md ${
                message.includes('successfully') 
                  ? 'bg-green-50 text-green-800 border border-green-200' 
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {message}
              </div>
            )}
          </div>
        </div>

        {/* Search and Filter Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold text-gray-900">Search & Filter</h2>
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-500">View:</span>
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-2 rounded ${viewMode === 'grid' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-2 rounded ${viewMode === 'list' ? 'bg-blue-100 text-blue-600' : 'text-gray-400'}`}
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 8a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 12a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 16a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
              {/* Search Input */}
              <div className="lg:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search
                </label>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name or description..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md 
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Category Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md 
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="All">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* File Type Filter */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  File Type
                </label>
                <select
                  value={selectedFileType}
                  onChange={(e) => setSelectedFileType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md 
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="All">All Types</option>
                  <option value="application/zip">ZIP Files</option>
                  <option value="application/x-msdownload">EXE Files</option>
                  <option value="application/vnd.android.package-archive">APK Files</option>
                  <option value="application/x-debian-package">DEB Files</option>
                </select>
              </div>

              {/* Sort Options */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Sort By
                </label>
                <select
                  value={`${sortBy}-${sortOrder}`}
                  onChange={(e) => {
                    const [field, order] = e.target.value.split('-');
                    setSortBy(field);
                    setSortOrder(order);
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md 
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="upload_date-desc">Newest First</option>
                  <option value="upload_date-asc">Oldest First</option>
                  <option value="original_name-asc">Name A-Z</option>
                  <option value="original_name-desc">Name Z-A</option>
                  <option value="file_size-desc">Largest First</option>
                  <option value="file_size-asc">Smallest First</option>
                  <option value="download_count-desc">Most Downloaded</option>
                </select>
              </div>
            </div>

            {/* Clear Filters Button */}
            <div className="mt-4 flex justify-between items-center">
              <button
                onClick={clearFilters}
                className="text-blue-600 hover:text-blue-800 font-medium"
              >
                Clear All Filters
              </button>
              <div className="text-sm text-gray-500">
                {isSearching ? 'Searching...' : `${files.length} files found`}
              </div>
            </div>
          </div>
        </div>

        {/* Category Statistics */}
        {stats.category_stats && stats.category_stats.length > 0 && (
          <div className="bg-white rounded-lg shadow mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Categories Overview</h2>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                {stats.category_stats.map((stat) => (
                  <div
                    key={stat._id}
                    className={`p-3 rounded-lg cursor-pointer transition-all duration-200 hover:shadow-md ${getCategoryColor(stat._id)}`}
                    onClick={() => setSelectedCategory(stat._id)}
                  >
                    <div className="text-sm font-medium">{stat._id}</div>
                    <div className="text-lg font-bold">{stat.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Files Display */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">
              Available Software
              {searchTerm && (
                <span className="text-sm font-normal text-gray-500 ml-2">
                  - Search results for "{searchTerm}"
                </span>
              )}
            </h2>
          </div>
          <div className="p-6">
            {files.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <div className="text-6xl mb-4">📦</div>
                {searchTerm || selectedCategory !== 'All' || selectedFileType !== 'All' 
                  ? 'No files match your search criteria. Try adjusting your filters.'
                  : 'No files uploaded yet. Upload your first software above!'}
              </div>
            ) : (
              <div className={
                viewMode === 'grid' 
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6' 
                  : 'space-y-4'
              }>
                {files.map((file) => (
                  viewMode === 'grid' ? (
                    // Grid View Card
                    <div key={file.id} className="bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden">
                      {/* Image Section */}
                      <div className="relative h-48 bg-gradient-to-br from-gray-50 to-gray-100">
                        {file.images && file.images.length > 0 ? (
                          <img
                            src={`${backendUrl}${file.images[0].thumbnail_url}`}
                            alt={file.original_name}
                            className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                            onClick={() => setSelectedImageModal(file.images[0])}
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-400">
                            <div className="text-center">
                              <div className="text-6xl mb-2">{getFileIcon(file.original_name)}</div>
                              <div className="text-sm">No Preview</div>
                            </div>
                          </div>
                        )}
                        
                        {/* Category Badge */}
                        <div className="absolute top-3 left-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(file.category)}`}>
                            {file.category}
                          </span>
                        </div>

                        {/* Image Count Badge */}
                        {file.images && file.images.length > 1 && (
                          <div className="absolute top-3 right-3 bg-black bg-opacity-50 text-white px-2 py-1 rounded-full text-xs">
                            +{file.images.length - 1} more
                          </div>
                        )}
                      </div>

                      {/* Content Section */}
                      <div className="p-5">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2 line-clamp-1">
                          {file.original_name}
                        </h3>
                        
                        {file.description && (
                          <p className="text-gray-600 text-sm mb-3 line-clamp-2">
                            {file.description}
                          </p>
                        )}

                        <div className="flex justify-between text-xs text-gray-500 mb-4">
                          <span>{formatFileSize(file.file_size)}</span>
                          <span>{formatDate(file.upload_date)}</span>
                          <span>{file.download_count} downloads</span>
                        </div>

                        {/* Image Thumbnails */}
                        {file.images && file.images.length > 0 && (
                          <div className="flex space-x-2 mb-4 overflow-x-auto">
                            {file.images.slice(0, 3).map((image, index) => (
                              <img
                                key={index}
                                src={`${backendUrl}${image.thumbnail_url}`}
                                alt={`Screenshot ${index + 1}`}
                                className="w-16 h-12 object-cover rounded cursor-pointer hover:opacity-75 transition-opacity flex-shrink-0"
                                onClick={() => setSelectedImageModal(image)}
                              />
                            ))}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleDownload(file.id, file.original_name)}
                            className="flex-1 bg-green-600 text-white px-4 py-2 rounded-md font-medium text-sm
                              hover:bg-green-700 transition-colors duration-200"
                          >
                            Download
                          </button>
                          <button
                            onClick={() => handleDelete(file.id)}
                            className="bg-red-600 text-white px-4 py-2 rounded-md font-medium text-sm
                              hover:bg-red-700 transition-colors duration-200"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    // List View
                    <div key={file.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start space-x-4">
                        {/* Thumbnail */}
                        <div className="w-20 h-16 flex-shrink-0 bg-gray-100 rounded-md overflow-hidden">
                          {file.images && file.images.length > 0 ? (
                            <img
                              src={`${backendUrl}${file.images[0].thumbnail_url}`}
                              alt={file.original_name}
                              className="w-full h-full object-cover cursor-pointer"
                              onClick={() => setSelectedImageModal(file.images[0])}
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-gray-400 text-2xl">
                              {getFileIcon(file.original_name)}
                            </div>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-lg font-medium text-gray-900">
                              {file.original_name}
                            </h3>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getCategoryColor(file.category)}`}>
                              {file.category}
                            </span>
                          </div>
                          {file.description && (
                            <p className="text-gray-600 mb-2">{file.description}</p>
                          )}
                          <div className="flex flex-wrap gap-4 text-sm text-gray-500">
                            <span>Size: {formatFileSize(file.file_size)}</span>
                            <span>Uploaded: {formatDate(file.upload_date)}</span>
                            <span>Downloads: {file.download_count}</span>
                            {file.images && file.images.length > 0 && (
                              <span>{file.images.length} screenshot(s)</span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleDownload(file.id, file.original_name)}
                            className="bg-green-600 text-white px-4 py-2 rounded-md font-medium
                              hover:bg-green-700 transition-colors duration-200"
                          >
                            Download
                          </button>
                          <button
                            onClick={() => handleDelete(file.id)}
                            className="bg-red-600 text-white px-4 py-2 rounded-md font-medium
                              hover:bg-red-700 transition-colors duration-200"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Image Modal */}
      <ImageModal 
        image={selectedImageModal} 
        onClose={() => setSelectedImageModal(null)} 
      />
    </div>
  );
}

export default App;