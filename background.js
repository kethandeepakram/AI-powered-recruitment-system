// background.js - minimalistic animated background with moving lines
(function() {
    const canvas = document.getElementById('bgCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width, height;
    
    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();
    
    // Create an array of line objects
    const numLines = 50;
    let lines = [];
    for (let i = 0; i < numLines; i++) {
      lines.push({
        x: Math.random() * width,
        y: Math.random() * height,
        dx: (Math.random() - 0.5) * 0.5,
        dy: (Math.random() - 0.5) * 0.5,
        length: 50 + Math.random() * 50
      });
    }
    
    function animate() {
      ctx.clearRect(0, 0, width, height);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      lines.forEach(line => {
        ctx.beginPath();
        ctx.moveTo(line.x, line.y);
        ctx.lineTo(line.x + line.length, line.y);
        ctx.stroke();
        
        // Update position
        line.x += line.dx;
        line.y += line.dy;
        
        // Wrap around
        if (line.x > width) line.x = 0;
        if (line.x < 0) line.x = width;
        if (line.y > height) line.y = 0;
        if (line.y < 0) line.y = height;
      });
      requestAnimationFrame(animate);
    }
    
    animate();
  })();
  