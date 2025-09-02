import { useState } from 'react';
import axios from 'axios';
import pdfToText from 'react-pdftotext';

function DocumentUploader() {
    const [text, setText] = useState('');
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleFileChange = (e) => {
        const uploadedFile = e.target.files[0];

        if (!uploadedFile) return;

        if (uploadedFile.type === 'text/plain') {
            const reader = new FileReader();
            reader.onload = (event) => {
                setText(event.target.result);
            };
            reader.readAsText(uploadedFile);
            setFile(uploadedFile);
        } else if (uploadedFile.type.includes('application/pdf')) {
            pdfToText(uploadedFile)
                .then(extractedText => { setText(extractedText) })
                .catch(err => console.error("Error extracting PDF text", err));
            setFile(uploadedFile);
        } else {
            alert('Please upload a valid file');
        }
    };

    const handleSubmit = async() => {
        if (!text.trim()) {
            alert('Please paste text or upload a file first.');
            return;
        }

        setLoading(true);

        try {
            await axios.post(`${process.env.REACT_APP_API_URL}/ingest`, {
                text,
                source: file ? 'file' : 'paste'
            });
            alert('Document uploaded successfully!');
            setText('');
            setFile(null);
        } catch (error) {
            console.error('Error uploading document:', error);
            alert('Upload failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ padding: '1rem' }}>
            <h1>Upload or Paste Document</h1>

            <textarea
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder='Paste your text here...'
                style={{ width: '100%', marginBottom: '1rem' }}
            />

            <input 
                type='file' 
                accept='.txt, .pdf, .doc, .docx' 
                onChange={handleFileChange} 
            />
            <br />

            <button onClick={handleSubmit} disabled={loading}>
                {loading ? 'Uploading...' : 'Upload'}
            </button>
        </div>
    );
}

export default DocumentUploader;
