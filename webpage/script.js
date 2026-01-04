let selectedFiles = [];
let selectedFormat = null;
let convertedFiles = [];

function switchTab(tab) {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelector(`[onclick="switchTab('${tab}')"]`).classList.add('active');
    document.getElementById(tab + '-tab').classList.add('active');
}

// Dropdown format selection
document.getElementById('format-select').onchange = () => {
    selectedFormat = document.getElementById('format-select').value;
};

const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.onclick = () => fileInput.click();

dropZone.ondragover = e => {
    e.preventDefault();
    dropZone.classList.add('dragover');
};

dropZone.ondragleave = () => dropZone.classList.remove('dragover');

dropZone.ondrop = e => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    selectedFiles = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    showMessage(`${selectedFiles.length} file(s) selected`, 'success');
};



fileInput.onchange = e => {
    selectedFiles = [...e.target.files];
    showMessage(`${selectedFiles.length} file(s) selected`, 'success');
};

function showMessage(text, type) {
    const el = document.getElementById('message');
    el.className = `message ${type}`;
    el.textContent = text;
}



async function convertImages() {
    if (!selectedFormat) return showMessage('No format selected', 'error');

    const activeTab = document.querySelector('.tab.active').textContent.includes('Url');
    let imagesToProcess = [];

    if (activeTab) {
        const urlsText = document.getElementById('image-urls').value.trim();
        if (!urlsText) {
            showMessage('Error', 'error');
            return;
        }
        
        const urls = urlsText.split('\n').map(url => url.trim()).filter(url => url.length > 0);
        if (urls.length === 0) {
            showMessage('Error', 'error');
            return;
        }
        
        imagesToProcess = urls.map(url => ({ type: 'url', data: url }));
        showMessage(`Converting ${urls.length} image(s) from Urls`, 'success');
    } else {
        if (selectedFiles.length === 0) {
            showMessage('Select an image', 'error');
            return;
        }
        imagesToProcess = selectedFiles.map(file => ({ type: 'file', data: file }));
        showMessage(`Converting ${selectedFiles.length} uploaded image(s)`, 'success');
    }

    document.getElementById('loading').style.display = 'block';
    document.getElementById('convert-btn').disabled = true;
    document.getElementById('preview').style.display = 'none';
    convertedFiles = []; // This SHOULD reset past converted files

    try {
        const results = [];
        for (let i = 0; i < imagesToProcess.length; i++) {
            if (i > 0) {
                await new Promise(resolve => setTimeout(resolve, 200)); // 0.2 second delay
            }
            
            const result = await processImage(imagesToProcess[i]);
            results.push(result);
            
            showMessage(`Converting ${i + 1}/${imagesToProcess.length} image(s) from ${imagesToProcess[0].type === 'url' ? 'Urls' : 'files'}`, 'success');
        }
        
        displayResults(results.filter(r => r.success));
        showMessage(`Finished converting ${results.filter(r => r.success).length} out of ${results.length} image(s)`, 'success');
    } catch (error) {
        showMessage('Error', 'error');
    } finally {
        document.getElementById('loading').style.display = 'none';
        document.getElementById('convert-btn').disabled = false;
    }
}

async function processImage(imageObj) {
    try {
        let formData = new FormData();
        formData.append('format', selectedFormat);

        if (imageObj.type === 'url') {
            formData.append('image_url', imageObj.data);
        } else {
            formData.append('image', imageObj.data);
        }

        const response = await fetch('/convert_image', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();
        
        if (result.status === 'success') {
            const filename = result.download_url.replace('/download/', '');
            convertedFiles.push(filename);
            
            return {
                success: true,
                originalName: imageObj.type === 'url' ? imageObj.data : imageObj.data.name,
                convertedUrl: result.converted_url,
                downloadUrl: result.download_url,
                filename: filename
            };
        } else {
            throw new Error('Error');
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}



function displayResults(results) {
    const previewGrid = document.getElementById('preview-grid');
    previewGrid.innerHTML = '';
    
    results.forEach((result, index) => {
        if (result.success) {
            const previewItem = document.createElement('div');
            previewItem.className = 'preview-item';
            previewItem.innerHTML = `
                <img src="${result.convertedUrl}" alt="Converted image" onerror="retryImage(this, ${index})">
                <a href="${result.downloadUrl}" class="download-btn" download>Download</a>
            `;
            previewGrid.appendChild(previewItem);
        }
    });
    
    const downloadBtn = document.getElementById('download-all-btn');
    if (results.length === 1) {
        downloadBtn.textContent = 'Download';
        downloadBtn.onclick = () => {
            window.open(results[0].downloadUrl, '_blank');
        };
    } else {
        downloadBtn.textContent = 'Download All';
        downloadBtn.onclick = downloadAll;
    }

    document.getElementById('preview').style.display = 'block';
}

function retryImage(imgElement, index) {
    setTimeout(() => {
        imgElement.src = imgElement.src;
    }, 3000);
}



async function downloadAll() {
    if (convertedFiles.length === 0) {
        showMessage('Error', 'error');
        return;
    }

    try {
        const response = await fetch('/download_all', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ filenames: convertedFiles }),
        });

        if (response.ok) {
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'converted_images.zip';
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
            showMessage('Download started', 'success');
        } else {
            throw new Error('Error');
        }
    } catch (error) {
        showMessage('Error', 'error');
    }
}