import React, { useEffect, useState } from 'react';
import { useParams, useLocation } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import './MarkdownPage.css';
import { owaspMappings } from './constants';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || '';

function MarkdownPage() {
  const { level } = useParams();
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const location = useLocation();
  const levelNumber = Number(level);
  const levelName = owaspMappings[levelNumber] || `Level ${levelNumber}`;

  useEffect(() => {
    console.log('MarkdownPage: Initializing for level', level);
    const queryParams = new URLSearchParams(location.search);
    const token = queryParams.get('token');
    console.log('MarkdownPage: Token from URL:', token, 'Level:', level);

    if (!token) {
      console.warn('MarkdownPage: No token provided');
      setError('Access denied: No token provided.');
      setContent('# Access Denied\nNo token provided.');
      return;
    }

    const fetchDocs = async () => {
      try {
        const url = `${API_BASE_URL}/api/docs/${level}?token=${token}`;
        console.log(`MarkdownPage: Fetching docs from ${url}`);
        const response = await fetch(url, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include'
        });
        console.log('MarkdownPage: Docs API response status:', response.status, 'statusText:', response.statusText);
        if (!response.ok) {
          const errorText = await response.text();
          console.log('MarkdownPage: Error response body:', errorText);
          throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
        }
        const data = await response.text();
        console.log('MarkdownPage: Docs content received:', data.slice(0, 100));
        setContent(data);
        setError('');
      } catch (err) {
        console.error('MarkdownPage: Error fetching markdown:', err);
        setError(`Failed to load documentation: ${err.message}`);
        setContent('# Failed to Load Documentation\nAn error occurred while fetching the documentation.');
      }
    };

    fetchDocs();
  }, [level, location.search]);

  return (
    <div className="markdown-page">
      <h1>CTF Solutions - Level {levelNumber}: {levelName}</h1>
      {error && <p className="error">{error}</p>}
      <div className="markdown-body">
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    </div>
  );
}

export default MarkdownPage;