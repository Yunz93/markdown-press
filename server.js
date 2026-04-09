const http = require('http');
const fs = require('fs');
const path = require('path');

const port = process.env.PORT || 8080;
const documentRoot = path.resolve(__dirname);

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.tsx': 'text/javascript',
  '.ts': 'text/javascript'
};

const server = http.createServer((req, res) => {
  console.log(`${req.method} ${req.url}`);

  const urlPath = req.url.split('?')[0];
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(urlPath);
  } catch {
    res.writeHead(400);
    res.end('Invalid request path');
    return;
  }

  const normalizedRequestPath = path.posix.normalize(decodedPath.replace(/\\/g, '/'));
  const requestedPath = normalizedRequestPath === '/' ? '/index.html' : normalizedRequestPath;
  const relativePath = requestedPath.replace(/^\/+/, '');
  const filePath = path.resolve(documentRoot, relativePath);

  const isWithinDocumentRoot = filePath === documentRoot || filePath.startsWith(`${documentRoot}${path.sep}`);
  if (!isWithinDocumentRoot) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  // Helper to serve file with fallback logic
  const serveFile = (targetPath, type, fallback) => {
    fs.readFile(targetPath, (err, content) => {
      if (err) {
        if (fallback) fallback();
        else {
            // SPA Fallback: serve index.html for 404s
            fs.readFile(path.join(documentRoot, 'index.html'), (err2, indexContent) => {
                if (err2) {
                    res.writeHead(500);
                    res.end('Error loading index.html');
                } else {
                    res.writeHead(200, { 'Content-Type': 'text/html' });
                    res.end(indexContent, 'utf-8');
                }
            });
        }
      } else {
        res.writeHead(200, { 'Content-Type': type });
        res.end(content, 'utf-8');
      }
    });
  };

  // Check extension
  const extname = String(path.extname(filePath)).toLowerCase();
  
  // If no extension, try to resolve as module (.tsx, .ts, .js)
  if (!extname && filePath !== path.join(documentRoot, 'index.html')) {
      const extensions = ['.tsx', '.ts', '.js', '.jsx'];
      
      const tryNextExt = (i) => {
          if (i >= extensions.length) {
              // No matching extension found, treat as SPA route (fallback to index.html)
              serveFile(path.join(documentRoot, 'index.html'), 'text/html', null);
              return;
          }
          const ext = extensions[i];
          const fullPath = filePath + ext;
          fs.access(fullPath, fs.constants.F_OK, (err) => {
             if (!err) {
                 serveFile(fullPath, mimeTypes[ext] || 'text/javascript', null);
             } else {
                 tryNextExt(i + 1);
             }
          });
      };
      tryNextExt(0);
  } else {
      const contentType = mimeTypes[extname] || 'application/octet-stream';
      serveFile(filePath, contentType, null);
  }
});

server.listen(port, () => {
  console.log(`Server running at http://0.0.0.0:${port}/`);
});
