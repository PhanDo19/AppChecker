import requests
import os
import time
import json
from datetime import datetime

class SoftwareDistributionTester:
    def __init__(self, base_url):
        self.base_url = base_url
        self.tests_run = 0
        self.tests_passed = 0
        self.uploaded_file_id = None
        self.test_file_path = "/tmp/test_file.zip"
        
    def run_test(self, name, method, endpoint, expected_status, data=None, files=None, params=None):
        """Run a single API test"""
        url = f"{self.base_url}/{endpoint}"
        headers = {}
        
        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, params=params)
            elif method == 'POST':
                response = requests.post(url, data=data, files=files, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)
            
            success = response.status_code == expected_status
            
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"Response: {response.json()}")
                except:
                    print(f"Response: {response.text}")
                return False, {}
                
        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}
    
    def create_test_file(self, size_kb=100):
        """Create a test file of specified size"""
        print(f"Creating test file of size {size_kb}KB")
        with open(self.test_file_path, 'wb') as f:
            f.write(os.urandom(size_kb * 1024))
        return self.test_file_path
    
    def test_health_check(self):
        """Test health check endpoint"""
        success, response = self.run_test(
            "Health Check",
            "GET",
            "api/health",
            200
        )
        if success:
            print(f"Health check response: {response}")
        return success
    
    def test_file_upload(self):
        """Test file upload endpoint"""
        # Create a test file
        test_file_path = self.create_test_file()
        
        # Prepare the file for upload
        files = {
            'file': ('test_file.zip', open(test_file_path, 'rb'), 'application/zip')
        }
        data = {
            'description': 'Test file upload'
        }
        
        success, response = self.run_test(
            "File Upload",
            "POST",
            "api/files/upload",
            200,
            data=data,
            files=files
        )
        
        if success and response.get('success'):
            self.uploaded_file_id = response.get('file_info', {}).get('id')
            print(f"Uploaded file ID: {self.uploaded_file_id}")
        
        return success
    
    def test_list_files(self):
        """Test list files endpoint"""
        success, response = self.run_test(
            "List Files",
            "GET",
            "api/files",
            200
        )
        
        if success:
            print(f"Found {len(response)} files")
            for file in response:
                print(f"- {file.get('original_name')} ({file.get('id')})")
        
        return success
    
    def test_file_info(self):
        """Test file info endpoint"""
        if not self.uploaded_file_id:
            print("❌ No file ID available for testing file info")
            return False
        
        success, response = self.run_test(
            "File Info",
            "GET",
            f"api/files/{self.uploaded_file_id}",
            200
        )
        
        if success:
            print(f"File info: {json.dumps(response, indent=2)}")
        
        return success
    
    def test_download_file(self):
        """Test file download endpoint"""
        if not self.uploaded_file_id:
            print("❌ No file ID available for testing file download")
            return False
        
        success, _ = self.run_test(
            "File Download",
            "GET",
            f"api/files/download/{self.uploaded_file_id}",
            200
        )
        
        return success
    
    def test_delete_file(self):
        """Test file deletion endpoint"""
        if not self.uploaded_file_id:
            print("❌ No file ID available for testing file deletion")
            return False
        
        success, response = self.run_test(
            "File Deletion",
            "DELETE",
            f"api/files/{self.uploaded_file_id}",
            200
        )
        
        if success:
            print(f"Deletion response: {response}")
            # Verify the file is actually deleted
            verify_success, _ = self.run_test(
                "Verify Deletion",
                "GET",
                f"api/files/{self.uploaded_file_id}",
                404
            )
            if verify_success:
                print("✅ File successfully deleted and not found anymore")
            else:
                print("❌ File still exists after deletion")
                success = False
        
        return success
    
    def test_stats(self):
        """Test statistics endpoint"""
        success, response = self.run_test(
            "Statistics",
            "GET",
            "api/stats",
            200
        )
        
        if success:
            print(f"Statistics: {json.dumps(response, indent=2)}")
        
        return success
    
    def run_all_tests(self):
        """Run all tests in sequence"""
        print("=" * 50)
        print("STARTING SOFTWARE DISTRIBUTION PLATFORM API TESTS")
        print("=" * 50)
        print(f"Base URL: {self.base_url}")
        print(f"Timestamp: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("=" * 50)
        
        # Run tests
        self.test_health_check()
        self.test_file_upload()
        self.test_list_files()
        self.test_file_info()
        self.test_download_file()
        self.test_stats()
        self.test_delete_file()
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"TESTS SUMMARY: {self.tests_passed}/{self.tests_run} passed")
        print("=" * 50)
        
        return self.tests_passed == self.tests_run

if __name__ == "__main__":
    # Get backend URL from environment or use the one from frontend .env
    backend_url = "https://febe9dc3-cd44-4ab7-a103-74a327109267.preview.emergentagent.com"
    
    # Run tests
    tester = SoftwareDistributionTester(backend_url)
    success = tester.run_all_tests()
    
    # Exit with appropriate code
    exit(0 if success else 1)