import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

function App() {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
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
  
  // Search and filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedFileType, setSelectedFileType] = useState('All');
  const [sortBy, setSortBy] = useState('upload_date');
  const [sortOrder, setSortOrder] = useState('desc');
  const [isSearching, setIsSearching] = useState(false);

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

    try {
      const response = await fetch(`${backendUrl}/api/files/upload`, {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        setMessage('File uploaded successfully!');
        setSelectedFile(null);
        setDescription('');
        setCategory('Other');
        document.getElementById('fileInput').value = '';
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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                Software Distribution Platform
              </h1>
              <p className="text-gray-600">Upload, organize and distribute your software</p>
            </div>
            <div className="flex space-x-6 text-sm text-gray-500">
              <div>
                <span className="font-semibold text-blue-600">{stats.total_files}</span> Files
              </div>
              <div>
                <span className="font-semibold text-green-600">{stats.total_downloads}</span> Downloads
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow mb-8">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Upload Software</h2>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select File
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
                  Description (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Enter file description..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md 
                    focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  rows="3"
                />
              </div>

              <button
                onClick={handleUpload}
                disabled={uploading || !selectedFile}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-medium
                  hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed
                  transition-colors duration-200"
              >
                {uploading ? 'Uploading...' : 'Upload File'}
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
            <h2 className="text-xl font-semibold text-gray-900">Search & Filter</h2>
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

        {/* Files List */}
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
              <div className="text-center py-8 text-gray-500">
                {searchTerm || selectedCategory !== 'All' || selectedFileType !== 'All' 
                  ? 'No files match your search criteria. Try adjusting your filters.'
                  : 'No files uploaded yet. Upload your first software above!'}
              </div>
            ) : (
              <div className="space-y-4">
                {files.map((file) => (
                  <div key={file.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
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
                        </div>
                      </div>
                      <div className="flex space-x-2 ml-4">
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
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;