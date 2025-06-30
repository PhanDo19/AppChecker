import React, { useState, useEffect } from 'react';
import './App.css';

function App() {
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [description, setDescription] = useState('');
  const [uploading, setUploading] = useState(false);
  const [stats, setStats] = useState({ total_files: 0, total_downloads: 0 });
  const [message, setMessage] = useState('');

  const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8001';

  // Fetch files on component mount
  useEffect(() => {
    fetchFiles();
    fetchStats();
  }, []);

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
              <p className="text-gray-600">Upload and distribute your software</p>
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

        {/* Files List */}
        <div className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Available Software</h2>
          </div>
          <div className="p-6">
            {files.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                No files uploaded yet. Upload your first software above!
              </div>
            ) : (
              <div className="space-y-4">
                {files.map((file) => (
                  <div key={file.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="text-lg font-medium text-gray-900 mb-1">
                          {file.original_name}
                        </h3>
                        {file.description && (
                          <p className="text-gray-600 mb-2">{file.description}</p>
                        )}
                        <div className="flex space-x-4 text-sm text-gray-500">
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