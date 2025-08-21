import { useState } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize from 'rehype-sanitize';

function ResponseBox({ reply }) {
    return (
        <div style={{ padding: '1rem', background: '#f9f9f9' }}>
            <ReactMarkdown 
                remarkPlugins={remarkGfm} 
                rehypePlugins={[rehypeHighlight, rehypeSanitize]}
                >
                {reply}
            </ReactMarkdown>
        </div>
    );
}

function Home() {
    const [message, setMessage] = useState('');
    const [reply, setReply] = useState('');
    const [loading, setLoading] = useState(false);

    const sendMessage = async () => {
        if (!message.trim()) {
            return;
        }

        setLoading(true);
        setReply('');

        try {
            const response = await axios.post(
                `${process.env.REACT_APP_API_URL}/ask`, 
                { message }
            );
            setReply(response.data.reply);
        } catch (error) {
            console.error('Error sending message:', error);
            console.log(`${process.env.REACT_APP_API_URL}`);
            setReply('Error connecting to the server.');
        } finally {
            setLoading(false);
            setMessage('');
        }
    };

    return (
        <div style={{ padding: '2rem' }}>
            <h1>Chat with Retrievo</h1>
            <textarea
                rows={3}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder='Type your message here...'
                aria-label='Type your message here...'
                style={{ width: '100%', padding: '0.5rem' }}
            />
            <br />
            <button onClick={sendMessage} disabled={loading}>
                {loading ? 'Sending...' : 'Send'}
            </button>

            {reply && (
                <div style={{ marginTop: '1rem', padding: '1rem', background: '#f9f9f9' }}>
                    <strong>Retrievo:</strong>
                    <ResponseBox reply={reply} />
                </div>
            )}
        </div>
    );
}

export default Home;
