const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 54112;
const JWT_SECRET = process.env.JWT_SECRET || 'folsme-secret-key-2024';

// Middleware
const allowedOrigins = process.env.CORS_ORIGINS 
  ? process.env.CORS_ORIGINS.split(',')
  : ['http://localhost:3000', 'http://localhost:7070', 'https://folsme.com', 'https://www.folsme.com'];

app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: 'folsme-admin-session',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 }
}));

// File upload configuration
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../public/uploads/'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'product-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Create uploads directory and data directory
const fs = require('fs');
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Database setup - Create data directory if it doesn't exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(path.join(__dirname, './data/database.sqlite'), (err) => {
  if (err) {
    console.error('Database connection error:', err.message);
  } else {
    console.log('✅ Connected to SQLite database');
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  console.log('🔄 Initializing database tables...');
  
  // Users table
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Customers table
  db.run(`CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'Nigeria',
    total_orders INTEGER DEFAULT 0,
    total_spent_cents INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Products table
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price_cents INTEGER NOT NULL,
    category TEXT NOT NULL,
    specs TEXT,
    images TEXT,
    stock_quantity INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Orders table
  db.run(`CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id INTEGER,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT,
    product_id INTEGER,
    quantity INTEGER NOT NULL,
    total_amount_cents INTEGER NOT NULL,
    status TEXT DEFAULT 'pending',
    tracking_number TEXT,
    shipping_address TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products (id),
    FOREIGN KEY (customer_id) REFERENCES customers (id)
  )`);

  // Blog posts table
  db.run(`CREATE TABLE IF NOT EXISTS blog_posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    content TEXT NOT NULL,
    excerpt TEXT,
    status TEXT DEFAULT 'draft',
    published_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Achievements table
  db.run(`CREATE TABLE IF NOT EXISTS achievements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    year INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    stats TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Achievement images table
  db.run(`CREATE TABLE IF NOT EXISTS achievement_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    image_url TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Gallery images table
  db.run(`CREATE TABLE IF NOT EXISTS gallery_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER,
    mime_type TEXT,
    alt_text TEXT,
    category TEXT DEFAULT 'general',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Website content table
  db.run(`CREATE TABLE IF NOT EXISTS website_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page TEXT NOT NULL,
    section TEXT NOT NULL,
    content_key TEXT NOT NULL,
    content_value TEXT NOT NULL,
    content_type TEXT DEFAULT 'text',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(page, section, content_key)
  )`);

  // Returns table
  db.run(`CREATE TABLE IF NOT EXISTS returns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id INTEGER NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    refund_amount_cents INTEGER,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (order_id) REFERENCES orders (id)
  )`);

  // Initialize for production deployment
  setTimeout(() => {
    createDefaultAdmin();
    clearSampleData(); // Clear any existing sample data
    console.log('🚀 Production mode: Clean database ready for deployment');
  }, 1000);
}

// Clear sample data for production
function clearSampleData() {
  console.log('🧹 Clearing sample data for production...');
  
  // Clear sample orders (keep structure)
  db.run('DELETE FROM orders WHERE tracking_number LIKE "FOLSME%"', (err) => {
    if (err) {
      console.error('Error clearing sample orders:', err);
    } else {
      console.log('✅ Sample orders cleared');
    }
  });
  
  // Clear sample customers (keep structure)
  db.run('DELETE FROM customers WHERE email LIKE "%@email.com"', (err) => {
    if (err) {
      console.error('Error clearing sample customers:', err);
    } else {
      console.log('✅ Sample customers cleared');
    }
  });
  
  // Clear sample blog posts (keep structure)
  db.run('DELETE FROM blog_posts WHERE slug LIKE "folsme-%"', (err) => {
    if (err) {
      console.error('Error clearing sample blog posts:', err);
    } else {
      console.log('✅ Sample blog posts cleared');
    }
  });
  
  // Clear sample products (keep structure)
  db.run('DELETE FROM products WHERE name LIKE "%Residential%" OR name LIKE "%Commercial%" OR name LIKE "%Industrial%"', (err) => {
    if (err) {
      console.error('Error clearing sample products:', err);
    } else {
      console.log('✅ Sample products cleared');
    }
  });
  
  console.log('🎯 Database ready for production - clean slate!');
}

// Create default admin user
function createDefaultAdmin() {
  const defaultUsername = 'admin';
  const defaultPassword = 'admin123';

  db.get('SELECT * FROM users WHERE username = ?', [defaultUsername], (err, row) => {
    if (err) {
      console.error('Error checking admin user:', err);
      return;
    }

    if (!row) {
      bcrypt.hash(defaultPassword, 10, (err, hash) => {
        if (err) {
          console.error('Error hashing password:', err);
          return;
        }

        db.run('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
          [defaultUsername, hash, 'admin'], (err) => {
            if (err) {
              console.error('Error creating admin:', err);
            } else {
              console.log('✅ Default admin created (admin/admin123)');
            }
          });
      });
    }
  });
}

// Initialize sample data
function initializeSampleData() {
  console.log('🔄 Initializing sample data...');
  
  // Sample customers
  const customers = [
    { name: 'John Adebayo', email: 'john.adebayo@email.com', phone: '+234 801 234 5678', address: '15 Victoria Island Road', city: 'Lagos', state: 'Lagos' },
    { name: 'Mary Okafor', email: 'mary.okafor@email.com', phone: '+234 802 345 6789', address: '23 Garki District', city: 'Abuja', state: 'FCT' },
    { name: 'Ibrahim Musa', email: 'ibrahim.musa@email.com', phone: '+234 803 456 7890', address: '45 Sabon Gari', city: 'Kano', state: 'Kano' },
    { name: 'Grace Eze', email: 'grace.eze@email.com', phone: '+234 804 567 8901', address: '12 Trans Amadi', city: 'Port Harcourt', state: 'Rivers' },
    { name: 'Ahmed Hassan', email: 'ahmed.hassan@email.com', phone: '+234 805 678 9012', address: '8 Barnawa Estate', city: 'Kaduna', state: 'Kaduna' }
  ];

  customers.forEach(customer => {
    db.run(`INSERT OR IGNORE INTO customers (name, email, phone, address, city, state, total_orders, total_spent_cents)
            VALUES (?, ?, ?, ?, ?, ?, 0, 0)`,
      [customer.name, customer.email, customer.phone, customer.address, customer.city, customer.state]);
  });

  // Sample products
  const products = [
    {
      name: '5kW Residential Magnetic Generator',
      description: 'Compact magnetic generator perfect for residential use, providing clean and reliable power for homes',
      price_cents: 250000000,
      category: 'generator',
      specs: JSON.stringify(['Power: 5kW', 'Fuel: Magnetic Technology', 'Features: Quiet Operation, Low Maintenance', 'Warranty: 2 Years', 'Usage: Residential homes, small offices'])
    },
    {
      name: '15kW Commercial Magnetic Generator',
      description: 'Heavy-duty generator for commercial and industrial applications with 24/7 operation capability',
      price_cents: 750000000,
      category: 'generator',
      specs: JSON.stringify(['Power: 15kW', 'Fuel: Magnetic Technology', 'Features: Industrial Grade, 24/7 Operation', 'Warranty: 3 Years', 'Usage: Commercial buildings, factories'])
    },
    {
      name: '25kW Industrial Magnetic Generator',
      description: 'High-capacity generator for large industrial facilities and manufacturing plants',
      price_cents: 1200000000,
      category: 'generator',
      specs: JSON.stringify(['Power: 25kW', 'Fuel: Magnetic Technology', 'Features: Heavy Duty, Continuous Operation', 'Warranty: 5 Years', 'Usage: Large factories, industrial complexes'])
    },
    {
      name: 'High Grade Gold Ore',
      description: 'Premium quality gold ore from our Erio-Ekiti mining operations with exceptional purity',
      price_cents: 5000000,
      category: 'mineral',
      specs: JSON.stringify(['Type: Gold Ore', 'Grade: High Grade', 'Purity: 95%', 'Origin: Erio-Ekiti Mining Site', 'Unit: per kg', 'DisplayType: both', 'Availability: In Stock'])
    },
    {
      name: 'Premium Limestone',
      description: 'High-quality limestone suitable for cement production and construction industry applications',
      price_cents: 1500000,
      category: 'mineral',
      specs: JSON.stringify(['Type: Limestone', 'Grade: Premium', 'Purity: 98%', 'Origin: Ewekoro Quarry', 'Unit: per tonne', 'DisplayType: both', 'Availability: In Stock'])
    },
    {
      name: 'Iron Ore Concentrate',
      description: 'High-grade iron ore concentrate for steel production and metallurgical applications',
      price_cents: 2500000,
      category: 'mineral',
      specs: JSON.stringify(['Type: Iron Ore', 'Grade: Concentrate', 'Purity: 92%', 'Origin: Itakpe Mines', 'Unit: per tonne', 'DisplayType: both', 'Availability: In Stock'])
    },
    {
      name: 'Industrial Kaolin Clay',
      description: 'Pure kaolin clay for ceramics, paper production, and pharmaceutical applications',
      price_cents: 800000,
      category: 'mineral',
      specs: JSON.stringify(['Type: Kaolin', 'Grade: Industrial Grade', 'Purity: 99%', 'Origin: Kankara Deposits', 'Unit: per tonne', 'DisplayType: both', 'Availability: In Stock'])
    }
  ];

  products.forEach((product, index) => {
    // Vary stock quantities: some in stock, some out of stock
    const stockQuantity = index % 3 === 0 ? 0 : Math.floor(Math.random() * 10) + 1;
    
    db.run(`INSERT OR IGNORE INTO products (name, description, price_cents, category, specs, images, stock_quantity, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [product.name, product.description, product.price_cents, product.category, product.specs, JSON.stringify([]), stockQuantity]);
  });

  // Sample orders (after delay to ensure customers and products exist)
  setTimeout(() => {
    db.all('SELECT id FROM customers LIMIT 5', [], (err, customerRows) => {
      if (err || !customerRows.length) return;
      
      db.all('SELECT id, price_cents FROM products LIMIT 3', [], (err, productRows) => {
        if (err || !productRows.length) return;

        const orders = [
          {
            customer_id: customerRows[0].id,
            customer_name: 'John Adebayo',
            customer_email: 'john.adebayo@email.com',
            customer_phone: '+234 801 234 5678',
            product_id: productRows[0].id,
            quantity: 1,
            total_amount_cents: productRows[0].price_cents,
            status: 'delivered',
            tracking_number: 'FOLSME001',
            created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
          },
          {
            customer_id: customerRows[1].id,
            customer_name: 'Mary Okafor',
            customer_email: 'mary.okafor@email.com',
            customer_phone: '+234 802 345 6789',
            product_id: productRows[1].id,
            quantity: 1,
            total_amount_cents: productRows[1].price_cents,
            status: 'shipped',
            tracking_number: 'FOLSME002',
            created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
          },
          {
            customer_id: customerRows[2].id,
            customer_name: 'Ibrahim Musa',
            customer_email: 'ibrahim.musa@email.com',
            customer_phone: '+234 803 456 7890',
            product_id: productRows[2].id,
            quantity: 10,
            total_amount_cents: productRows[2].price_cents * 10,
            status: 'processing',
            created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
          }
        ];

        orders.forEach(order => {
          db.run(`INSERT OR IGNORE INTO orders 
                  (customer_id, customer_name, customer_email, customer_phone, product_id, quantity, total_amount_cents, status, tracking_number, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [order.customer_id, order.customer_name, order.customer_email, order.customer_phone, 
             order.product_id, order.quantity, order.total_amount_cents, order.status, order.tracking_number, order.created_at]);
        });

        // Update customer totals
        setTimeout(() => {
          db.run(`UPDATE customers SET 
                  total_orders = (SELECT COUNT(*) FROM orders WHERE customer_id = customers.id),
                  total_spent_cents = (SELECT COALESCE(SUM(total_amount_cents), 0) FROM orders WHERE customer_id = customers.id)`);
        }, 1000);
      });
    });
  }, 2000);

  // Sample blog posts
  setTimeout(() => {
    const blogPosts = [
      {
        title: 'FOLSME International: Leading Nigeria\'s Industrial Revolution',
        slug: 'folsme-leading-nigeria-industrial-revolution',
        content: 'Since our establishment in 2015, FOLSME International Limited has been at the forefront of Nigeria\'s industrial transformation...',
        excerpt: 'Discover how FOLSME International has become a leading force in Nigeria\'s industrial sector.',
        status: 'published',
        published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        title: 'The Future of Clean Energy: Magnetic Generator Technology',
        slug: 'future-clean-energy-magnetic-generator-technology',
        content: 'As Nigeria continues to face energy challenges, innovative solutions are needed...',
        excerpt: 'Learn about revolutionary magnetic generator technology transforming Nigeria\'s energy landscape.',
        status: 'published',
        published_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
      }
    ];

    blogPosts.forEach(post => {
      db.run(`INSERT OR IGNORE INTO blog_posts (title, slug, content, excerpt, status, published_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [post.title, post.slug, post.content, post.excerpt, post.status, post.published_at, new Date().toISOString()]);
    });
  }, 3000);

  // Sample achievements
  setTimeout(() => {
    const achievements = [
      { year: 2015, title: 'Company Foundation', description: 'FOLSME International Limited was established with a vision to transform Nigeria\'s industrial landscape.', stats: 'CAC Registered, First Office, 3 Founding Members' },
      { year: 2018, title: 'First Major Mining Contract', description: 'Secured our first major mining contract in Erio-Ekiti.', stats: '500+ Tonnes Processed, 10 Employees' },
      { year: 2023, title: 'Multi-State Operations', description: 'Expanded operations across multiple Nigerian states.', stats: '5 States, 100+ Projects, 50+ Employees' }
    ];

    achievements.forEach(achievement => {
      db.run(`INSERT OR IGNORE INTO achievements (year, title, description, stats)
              VALUES (?, ?, ?, ?)`,
        [achievement.year, achievement.title, achievement.description, achievement.stats]);
    });
  }, 4000);

  // Sample website content
  setTimeout(() => {
    const defaultContent = [
      { page: 'homepage', section: 'hero', content_key: 'title', content_value: 'FOLSME International Ltd' },
      { page: 'homepage', section: 'hero', content_key: 'subtitle', content_value: 'Leading Nigeria\'s Industrial Growth' },
      { page: 'homepage', section: 'about', content_key: 'title', content_value: 'About FOLSME International' },
      { page: 'homepage', section: 'about', content_key: 'description', content_value: 'Since 2015, FOLSME International Limited has been at the forefront of Nigeria\'s industrial transformation through innovative mining and energy solutions.' },
      { page: 'homepage', section: 'services', content_key: 'title', content_value: 'Our Services' },
      { page: 'homepage', section: 'services', content_key: 'description', content_value: 'We provide comprehensive industrial solutions across mining, energy, construction, and logistics sectors.' }
    ];

    defaultContent.forEach(item => {
      db.run(`INSERT OR IGNORE INTO website_content (page, section, content_key, content_value)
              VALUES (?, ?, ?, ?)`,
        [item.page, item.section, item.content_key, item.content_value]);
    });
  }, 5000);

  // Sample gallery images
  setTimeout(() => {
    const sampleImages = [
      { filename: 'company-building.jpg', original_name: 'FOLSME Head Office', file_path: '/uploads/company-building.jpg', alt_text: 'FOLSME International Head Office Building', category: 'company' },
      { filename: 'mining-site.jpg', original_name: 'Erio-Ekiti Mining Site', file_path: '/uploads/mining-site.jpg', alt_text: 'Our mining operations in Erio-Ekiti', category: 'mining' },
      { filename: 'generator-showcase.jpg', original_name: 'Generator Showcase', file_path: '/uploads/generator-showcase.jpg', alt_text: 'Our magnetic generator products', category: 'products' },
      { filename: 'team-photo.jpg', original_name: 'FOLSME Team', file_path: '/uploads/team-photo.jpg', alt_text: 'FOLSME International team members', category: 'company' }
    ];

    sampleImages.forEach(image => {
      db.run(`INSERT OR IGNORE INTO gallery_images (filename, original_name, file_path, alt_text, category, file_size, mime_type)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [image.filename, image.original_name, image.file_path, image.alt_text, image.category, 1024000, 'image/jpeg']);
    });
  }, 6000);

  console.log('✅ Sample data initialization completed');
}

// Authentication middleware
function authenticateToken(req, res, next) {
  const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// ROUTES

// Login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;

  db.get('SELECT * FROM users WHERE username = ?', [username], (err, user) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    bcrypt.compare(password, user.password_hash, (err, result) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Authentication error' });
      }

      if (!result) {
        return res.status(401).json({ success: false, message: 'Invalid credentials' });
      }

      const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: '24h' }
      );

      res.cookie('token', token, {
        httpOnly: true,
        secure: false,
        maxAge: 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        message: 'Login successful',
        token: token,
        user: { id: user.id, username: user.username, role: user.role }
      });
    });
  });
});

// Logout
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logout successful' });
});

// ANALYTICS ENDPOINTS (FIXED)
app.get('/api/admin/sales/analytics', authenticateToken, (req, res) => {
  console.log('📊 Analytics request received');
  
  // Get orders stats
  db.get(`SELECT
    COUNT(*) as total_orders,
    COALESCE(SUM(total_amount_cents), 0) as total_revenue,
    COALESCE(AVG(total_amount_cents), 0) as avg_order_value
    FROM orders
    WHERE status != 'cancelled'`, [], (err, orderStats) => {
    
    if (err) {
      console.error('Analytics error:', err);
      return res.status(500).json({ success: false, message: 'Database error', error: err.message });
    }

    // Get products count
    db.get(`SELECT COUNT(*) as total_products FROM products WHERE is_active = 1`, [], (err, productStats) => {
      
      if (err) {
        console.error('Product stats error:', err);
        return res.status(500).json({ success: false, message: 'Database error', error: err.message });
      }

      // Get customers count
      db.get(`SELECT COUNT(*) as total_customers FROM customers`, [], (err, customerStats) => {
        
        if (err) {
          console.error('Customer stats error:', err);
          return res.status(500).json({ success: false, message: 'Database error', error: err.message });
        }

        const result = {
          success: true,
          total_orders: orderStats.total_orders || 0,
          total_revenue: orderStats.total_revenue || 0,
          total_products: productStats.total_products || 0,
          total_customers: customerStats.total_customers || 0,
          avg_order_value: orderStats.avg_order_value || 0
        };

        console.log('✅ Analytics response:', result);
        res.json(result);
      });
    });
  });
});

app.get('/api/admin/analytics/sales-trends', authenticateToken, (req, res) => {
  const period = req.query.period || 30;
  
  db.all(`SELECT 
    DATE(created_at) as date,
    COUNT(*) as orders,
    COALESCE(SUM(total_amount_cents), 0) as revenue
    FROM orders 
    WHERE created_at >= datetime('now', '-${period} days')
    AND status != 'cancelled'
    GROUP BY DATE(created_at)
    ORDER BY date DESC`, [], (err, trends) => {
    
    if (err) {
      console.error('Sales trends error:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    
    res.json({ success: true, trends: trends || [] });
  });
});

app.get('/api/admin/analytics/geographic-sales', authenticateToken, (req, res) => {
  db.all(`SELECT 
    c.state,
    COUNT(o.id) as orders,
    COALESCE(SUM(o.total_amount_cents), 0) as revenue
    FROM customers c
    LEFT JOIN orders o ON c.id = o.customer_id AND o.status != 'cancelled'
    WHERE c.state IS NOT NULL AND c.state != ''
    GROUP BY c.state
    ORDER BY revenue DESC
    LIMIT 10`, [], (err, geographic) => {
    
    if (err) {
      console.error('Geographic sales error:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    
    res.json({ success: true, geographic: geographic || [] });
  });
});

app.get('/api/admin/analytics/customer-analytics', authenticateToken, (req, res) => {
  db.all(`SELECT 
    c.name,
    COUNT(o.id) as total_orders,
    COALESCE(SUM(o.total_amount_cents), 0) as total_spent_cents
    FROM customers c
    LEFT JOIN orders o ON c.id = o.customer_id AND o.status != 'cancelled'
    GROUP BY c.id, c.name
    HAVING COUNT(o.id) > 0
    ORDER BY total_spent_cents DESC
    LIMIT 10`, [], (err, customers) => {
    
    if (err) {
      console.error('Customer analytics error:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    
    res.json({ success: true, topCustomers: customers || [] });
  });
});

// PRODUCTS
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    const products = rows.map(product => ({
      ...product,
      specs: product.specs ? JSON.parse(product.specs) : [],
      images: product.images ? JSON.parse(product.images) : []
    }));

    res.json({ success: true, products });
  });
});

// MINERALS API
app.get('/api/minerals', (req, res) => {
  db.all('SELECT * FROM products WHERE category = "mineral" AND is_active = 1 ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    const minerals = rows.map(product => {
      const specs = product.specs ? JSON.parse(product.specs) : [];
      const images = product.images ? JSON.parse(product.images) : [];
      
      // Extract specific data from specs
      const typeSpec = specs.find(spec => spec.startsWith('Type:'));
      const priceSpec = specs.find(spec => spec.startsWith('Price:'));
      const unitSpec = specs.find(spec => spec.startsWith('Unit:'));
      const availabilitySpec = specs.find(spec => spec.startsWith('Availability:'));
      const puritySpec = specs.find(spec => spec.startsWith('Purity:'));
      const displayTypeSpec = specs.find(spec => spec.startsWith('DisplayType:'));
      
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        image: images.length > 0 ? images[0] : '/images/minerals/default.jpg',
        type: typeSpec ? typeSpec.replace('Type: ', '') : '',
        price: priceSpec ? priceSpec.replace('Price: ₦', '').replace(/,/g, '') : product.price_cents / 100,
        unit: unitSpec ? unitSpec.replace('Unit: ', '') : 'kg',
        availability: availabilitySpec ? availabilitySpec.replace('Availability: ', '') : 'available',
        purity: puritySpec ? puritySpec.replace('Purity: ', '') : '',
        displayType: displayTypeSpec ? displayTypeSpec.replace('DisplayType: ', '') : 'both',
        specs: specs,
        price_cents: product.price_cents
      };
    });

    res.json({ success: true, minerals });
  });
});

// Get minerals for showcase section only
app.get('/api/minerals/showcase', (req, res) => {
  console.log('📡 API: /api/minerals/showcase called');
  
  db.all('SELECT * FROM products WHERE category = "mineral" AND is_active = 1 ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error('❌ Database error in showcase minerals:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    console.log(`📊 Found ${rows.length} active minerals in database`);

    const minerals = rows.map(product => {
      const specs = product.specs ? JSON.parse(product.specs) : [];
      const images = product.images ? JSON.parse(product.images) : [];
      
      const displayTypeSpec = specs.find(spec => spec.startsWith('DisplayType:'));
      const displayType = displayTypeSpec ? displayTypeSpec.replace('DisplayType: ', '') : 'both';
      
      // Ensure proper image URL
      let imageUrl = '/images/minerals/default.jpg';
      if (images.length > 0) {
        imageUrl = images[0].startsWith('/') ? images[0] : `/uploads/${images[0]}`;
      }
      
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        image: imageUrl,
        displayType: displayType,
        specs: specs
      };
    }).filter(mineral => mineral.displayType === 'showcase' || mineral.displayType === 'both');

    console.log(`✅ Returning ${minerals.length} showcase minerals`);
    res.json({ success: true, minerals });
  });
});

// Get minerals for buy section only
app.get('/api/minerals/buy', (req, res) => {
  console.log('📡 API: /api/minerals/buy called');
  
  db.all('SELECT * FROM products WHERE category = "mineral" AND is_active = 1 ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error('❌ Database error in buy minerals:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    console.log(`📊 Found ${rows.length} active minerals for buy section`);

    const minerals = rows.map(product => {
      const specs = product.specs ? JSON.parse(product.specs) : [];
      const images = product.images ? JSON.parse(product.images) : [];
      
      const typeSpec = specs.find(spec => spec.startsWith('Type:'));
      const priceSpec = specs.find(spec => spec.startsWith('Price:'));
      const unitSpec = specs.find(spec => spec.startsWith('Unit:'));
      const availabilitySpec = specs.find(spec => spec.startsWith('Availability:'));
      const puritySpec = specs.find(spec => spec.startsWith('Purity:'));
      const displayTypeSpec = specs.find(spec => spec.startsWith('DisplayType:'));
      
      const displayType = displayTypeSpec ? displayTypeSpec.replace('DisplayType: ', '') : 'both';
      
      // Ensure proper image URL
      let imageUrl = '/images/minerals/default.jpg';
      if (images.length > 0) {
        imageUrl = images[0].startsWith('/') ? images[0] : `/uploads/${images[0]}`;
      }
      
      // Extract price from spec or use price_cents
      let price = product.price_cents / 100;
      if (priceSpec) {
        const priceMatch = priceSpec.match(/₦([\d,]+)/);
        if (priceMatch) {
          price = parseInt(priceMatch[1].replace(/,/g, ''));
        }
      }
      
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        image: imageUrl,
        type: typeSpec ? typeSpec.replace('Type: ', '') : '',
        price: price,
        unit: unitSpec ? unitSpec.replace('Unit: ', '') : 'kg',
        availability: availabilitySpec ? availabilitySpec.replace('Availability: ', '') : 'available',
        purity: puritySpec ? puritySpec.replace('Purity: ', '') : '',
        displayType: displayType,
        specs: specs,
        price_cents: product.price_cents
      };
    }).filter(mineral => mineral.displayType === 'for-sale' || mineral.displayType === 'both');

    console.log(`✅ Returning ${minerals.length} buy minerals`);
    res.json({ success: true, minerals });
  });
});

app.get('/api/admin/products', authenticateToken, (req, res) => {
  const { category } = req.query;
  
  let query = 'SELECT * FROM products';
  let params = [];
  
  if (category) {
    query += ' WHERE category = ?';
    params.push(category);
  }
  
  query += ' ORDER BY created_at DESC';
  
  db.all(query, params, (err, rows) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    const products = rows.map(product => ({
      ...product,
      specs: product.specs ? JSON.parse(product.specs) : [],
      images: product.images ? JSON.parse(product.images) : []
    }));

    console.log(`📊 Admin API: Returning ${products.length} products${category ? ` for category "${category}"` : ''}`);
    res.json({ success: true, products });
  });
});

// Get single product by ID
app.get('/api/admin/products/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (!row) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Parse JSON fields
    const product = {
      ...row,
      specs: row.specs ? JSON.parse(row.specs) : [],
      images: row.images ? JSON.parse(row.images) : []
    };

    res.json({
      success: true,
      product: product
    });
  });
});

app.post('/api/admin/products', authenticateToken, upload.single('image'), (req, res) => {
  const { name, description, price_cents, category } = req.body;
  
  let specs = [];
  let images = [];
  
  if (req.file) {
    images = [`/uploads/${req.file.filename}`];
  }

  db.run(`INSERT INTO products (name, description, price_cents, category, specs, images, is_active)
          VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [name, description, parseInt(price_cents) * 100, category, JSON.stringify(specs), JSON.stringify(images)],
    function(err) {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error' });
      }
      res.json({ success: true, message: 'Product created successfully', productId: this.lastID });
    });
});

app.put('/api/admin/products/:id', authenticateToken, upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { name, description, price_cents, category, is_active } = req.body;

  // Get current product to preserve existing images if no new image uploaded
  db.get('SELECT images FROM products WHERE id = ?', [id], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    let imagesJson;
    if (req.file) {
      // New image uploaded
      const imageUrl = `/uploads/${req.file.filename}`;
      imagesJson = JSON.stringify([imageUrl]);
    } else {
      // Keep existing images
      imagesJson = row ? row.images : JSON.stringify([]);
    }

    db.run(`UPDATE products
            SET name = ?, description = ?, price_cents = ?, category = ?, images = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?`,
      [name, description, parseInt(price_cents) * 100, category, imagesJson, is_active !== undefined ? is_active : 1, id],
      function(err) {
        if (err) {
          return res.status(500).json({ success: false, message: 'Database error' });
        }
        res.json({ success: true, message: 'Product updated successfully' });
      });
  });
});

app.delete('/api/admin/products/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM products WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Product deleted successfully' });
  });
});

// CUSTOMERS
app.get('/api/admin/customers', authenticateToken, (req, res) => {
  db.all('SELECT * FROM customers ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, customers: rows });
  });
});

// ORDERS
app.get('/api/admin/orders', authenticateToken, (req, res) => {
  db.all(`SELECT o.*, p.name as product_name
          FROM orders o
          LEFT JOIN products p ON o.product_id = p.id
          ORDER BY o.created_at DESC`, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, orders: rows });
  });
});

// BLOG
app.get('/api/blog', (req, res) => {
  db.all('SELECT * FROM blog_posts WHERE status = "published" ORDER BY published_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, posts: rows });
  });
});

app.get('/api/admin/blog', authenticateToken, (req, res) => {
  db.all('SELECT * FROM blog_posts ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, posts: rows });
  });
});

app.post('/api/admin/blog', authenticateToken, (req, res) => {
  const { title, slug, content, excerpt, status } = req.body;
  const published_at = status === 'published' ? new Date().toISOString() : null;

  db.run(`INSERT INTO blog_posts (title, slug, content, excerpt, status, published_at)
          VALUES (?, ?, ?, ?, ?, ?)`,
    [title, slug, content, excerpt, status, published_at],
    function(err) {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error' });
      }
      res.json({ success: true, message: 'Blog post created successfully', id: this.lastID });
    });
});

// ACHIEVEMENTS
app.get('/api/achievements', (req, res) => {
  db.all('SELECT * FROM achievements WHERE is_active = 1 ORDER BY year DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, achievements: rows });
  });
});

app.get('/api/admin/achievements', authenticateToken, (req, res) => {
  db.all('SELECT * FROM achievements ORDER BY year DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, achievements: rows });
  });
});

app.post('/api/admin/achievements', authenticateToken, (req, res) => {
  const { year, title, description, stats } = req.body;
  
  db.run(`INSERT INTO achievements (year, title, description, stats)
          VALUES (?, ?, ?, ?)`,
    [year, title, description, stats],
    function(err) {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error' });
      }
      res.json({ success: true, message: 'Achievement added successfully', id: this.lastID });
    });
});

// ACHIEVEMENT IMAGES
app.get('/api/achievement-images', (req, res) => {
  db.all('SELECT * FROM achievement_images WHERE is_active = 1 ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, images: rows });
  });
});

app.get('/api/admin/achievement-images', authenticateToken, (req, res) => {
  db.all('SELECT * FROM achievement_images ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, images: rows });
  });
});

app.post('/api/admin/achievement-images', authenticateToken, upload.single('image'), (req, res) => {
  const { title } = req.body;
  
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Image file is required' });
  }
  
  const imageUrl = `/uploads/${req.file.filename}`;
  
  db.run(`INSERT INTO achievement_images (title, image_url)
          VALUES (?, ?)`, [title, imageUrl], function(err) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Achievement image added successfully', id: this.lastID });
  });
});

app.delete('/api/admin/achievement-images/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM achievement_images WHERE id = ?', [id], function(err) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Achievement image deleted successfully' });
  });
});

// GALLERY MANAGEMENT
app.get('/api/admin/gallery', authenticateToken, (req, res) => {
  console.log('🖼️ Gallery request received');
  
  db.all('SELECT * FROM gallery_images ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error('❌ Gallery database error:', err);
      return res.status(500).json({ success: false, message: 'Database error', error: err.message });
    }
    
    console.log(`✅ Found ${rows.length} gallery images`);
    res.json({ success: true, images: rows || [] });
  });
});

// Public gallery endpoint for frontend
app.get('/api/gallery', (req, res) => {
  console.log('🖼️ Public gallery request received');
  
  db.all('SELECT * FROM gallery_images ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      console.error('❌ Public gallery database error:', err);
      return res.status(500).json({ success: false, message: 'Database error', error: err.message });
    }
    
    console.log(`✅ Found ${rows.length} public gallery images`);
    res.json({ success: true, images: rows || [] });
  });
});

app.post('/api/admin/gallery', authenticateToken, upload.single('image'), (req, res) => {
  const { alt_text, category } = req.body;
  
  console.log('🖼️ Uploading gallery image:', { alt_text, category, file: req.file ? req.file.filename : 'none' });
  
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'Image file is required' });
  }
  
  const filePath = `/uploads/${req.file.filename}`;
  
  db.run(`INSERT INTO gallery_images (filename, original_name, file_path, file_size, mime_type, alt_text, category)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [req.file.filename, req.file.originalname, filePath, req.file.size, req.file.mimetype, alt_text, category || 'general'],
    function(err) {
      if (err) {
        console.error('❌ Gallery upload error:', err);
        return res.status(500).json({ success: false, message: 'Database error', error: err.message });
      }
      
      console.log('✅ Gallery image uploaded successfully with ID:', this.lastID);
      res.json({ success: true, message: 'Image uploaded successfully', id: this.lastID });
    });
});

app.delete('/api/admin/gallery/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  console.log('🖼️ Deleting gallery image:', id);
  
  db.run('DELETE FROM gallery_images WHERE id = ?', [id], function(err) {
    if (err) {
      console.error('❌ Gallery delete error:', err);
      return res.status(500).json({ success: false, message: 'Database error', error: err.message });
    }
    
    console.log('✅ Gallery image deleted successfully');
    res.json({ success: true, message: 'Image deleted successfully' });
  });
});

// CONTENT MANAGEMENT
app.get('/api/admin/content/homepage', authenticateToken, (req, res) => {
  db.all('SELECT * FROM website_content WHERE page = "homepage" ORDER BY section, content_key', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, content: rows });
  });
});

app.put('/api/admin/content', authenticateToken, (req, res) => {
  const { page, section, content_key, content_value } = req.body;
  
  db.run(`INSERT OR REPLACE INTO website_content (page, section, content_key, content_value, updated_at)
          VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [page, section, content_key, content_value],
    function(err) {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error' });
      }
      res.json({ success: true, message: 'Content updated successfully' });
    });
});

// RETURNS MANAGEMENT
app.get('/api/admin/returns', authenticateToken, (req, res) => {
  console.log('📦 Returns request received');
  
  db.all(`SELECT r.*, o.customer_name, o.customer_email, p.name as product_name
          FROM returns r
          LEFT JOIN orders o ON r.order_id = o.id
          LEFT JOIN products p ON o.product_id = p.id
          ORDER BY r.created_at DESC`, [], (err, rows) => {
    if (err) {
      console.error('❌ Returns database error:', err);
      return res.status(500).json({ success: false, message: 'Database error', error: err.message });
    }
    
    console.log(`✅ Found ${rows.length} returns`);
    res.json({ success: true, returns: rows || [] });
  });
});

app.post('/api/admin/returns', authenticateToken, (req, res) => {
  const { order_id, reason, refund_amount_cents } = req.body;
  
  console.log('📦 Processing new return:', { order_id, reason, refund_amount_cents });
  
  db.run(`INSERT INTO returns (order_id, reason, refund_amount_cents, status)
          VALUES (?, ?, ?, 'pending')`,
    [order_id, reason, refund_amount_cents],
    function(err) {
      if (err) {
        console.error('❌ Return creation error:', err);
        return res.status(500).json({ success: false, message: 'Database error', error: err.message });
      }
      
      console.log('✅ Return created successfully with ID:', this.lastID);
      res.json({ success: true, message: 'Return processed successfully', id: this.lastID });
    });
});

app.put('/api/admin/returns/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  
  console.log('📦 Updating return status:', { id, status });
  
  db.run(`UPDATE returns SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, id],
    function(err) {
      if (err) {
        console.error('❌ Return update error:', err);
        return res.status(500).json({ success: false, message: 'Database error', error: err.message });
      }
      
      console.log('✅ Return status updated successfully');
      res.json({ success: true, message: 'Return status updated successfully' });
    });
});

// STATIC FILES
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use(express.static(path.join(__dirname, '../../')));

// ADMIN ROUTES
app.get('/admin', (req, res) => {
  res.redirect('/admin/login.html');
});

app.get('/admin/login.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

app.get('/admin/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/admin/generators.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/generators.html'));
});

app.get('/admin/minerals.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/minerals.html'));
});

app.get('/admin/orders.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/orders.html'));
});

app.get('/admin/blog-admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/blog-admin.html'));
});

app.get('/admin/achievements-admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/achievements-admin.html'));
});

// Create payment endpoint
app.post('/api/create-payment', async (req, res) => {
  try {
    console.log('💳 Creating payment for:', req.body);
    
    const { formData, cartItems, subtotal, shipping, total, paymentMethod } = req.body;
    
    // Generate order number
    const orderNumber = 'FS' + Date.now();
    
    // Check if this is a sell inquiry or regular purchase
    const isSellInquiry = cartItems.some(item => item.type === 'sell_inquiry');
    
    if (isSellInquiry) {
      // Handle sell inquiry - no payment needed
      console.log('📝 Processing sell inquiry');
      res.json({
        success: true,
        message: 'Inquiry submitted successfully',
        orderNumber: orderNumber,
        type: 'sell_inquiry'
      });
    } else {
      // Handle regular purchase - save order to database
      console.log('🛒 Processing regular purchase');
      
      // Get customer ID or create new customer
      let customerId = null;
      
      // Check if customer exists
      db.get('SELECT id FROM customers WHERE email = ?', [formData.email], (err, customer) => {
        if (err) {
          console.error('Error checking customer:', err);
        }
        
        if (customer) {
          customerId = customer.id;
          saveOrder();
        } else {
          // Create new customer
          db.run(`INSERT INTO customers (name, email, phone, address, city, state, country, total_orders, total_spent_cents)
                  VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
            [formData.fullName, formData.email, formData.phone, formData.street, 
             formData.city, formData.state, formData.country, total],
            function(err) {
              if (err) {
                console.error('Error creating customer:', err);
              } else {
                customerId = this.lastID;
                console.log('✅ New customer created with ID:', customerId);
              }
              saveOrder();
            });
        }
      });
      
      function saveOrder() {
        // Save each cart item as separate order
        cartItems.forEach((item, index) => {
          const orderData = {
            customer_id: customerId,
            customer_name: formData.fullName,
            customer_email: formData.email,
            customer_phone: formData.phone,
            product_id: item.id.replace('gen_', ''), // Remove 'gen_' prefix
            quantity: item.quantity || 1,
            total_amount_cents: item.price * (item.quantity || 1),
            status: paymentMethod === 'paystack' ? 'pending_payment' : 'pending',
            tracking_number: orderNumber + '-' + (index + 1),
            shipping_address: `${formData.street}, ${formData.city}, ${formData.state}, ${formData.country}`
          };
          
          db.run(`INSERT INTO orders (customer_id, customer_name, customer_email, customer_phone, 
                                    product_id, quantity, total_amount_cents, status, tracking_number, 
                                    shipping_address, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
            [orderData.customer_id, orderData.customer_name, orderData.customer_email, 
             orderData.customer_phone, orderData.product_id, orderData.quantity, 
             orderData.total_amount_cents, orderData.status, orderData.tracking_number, 
             orderData.shipping_address],
            function(err) {
              if (err) {
                console.error('❌ Error saving order:', err);
              } else {
                console.log('✅ Order saved with ID:', this.lastID);
              }
            });
        });
      }
      
      // Return success response
      res.json({
        success: true,
        message: 'Order created successfully',
        orderNumber: orderNumber,
        paymentRequired: paymentMethod === 'paystack',
        paymentUrl: null // Frontend will handle Paystack
      });
    }
    
  } catch (error) {
    console.error('❌ Payment creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Payment creation failed',
      error: error.message
    });
  }
});

// Update order status after payment
app.post('/api/update-order-status', async (req, res) => {
  try {
    const { orderNumber, status, paymentReference } = req.body;
    
    console.log('📝 Updating order status:', { orderNumber, status, paymentReference });
    
    // Update all orders with this tracking number prefix
    db.run(`UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP 
            WHERE tracking_number LIKE ?`,
      [status, orderNumber + '%'],
      function(err) {
        if (err) {
          console.error('❌ Error updating order status:', err);
          res.status(500).json({ success: false, message: 'Failed to update order status' });
        } else {
          console.log('✅ Updated', this.changes, 'orders to status:', status);
          res.json({ success: true, message: 'Order status updated successfully' });
        }
      });
      
  } catch (error) {
    console.error('❌ Order update error:', error);
    res.status(500).json({ success: false, message: 'Order update failed' });
  }
});

// Clean dummy orders and setup production data
app.post('/api/admin/cleanup-dummy-data', authenticateToken, (req, res) => {
  console.log('🧹 Starting dummy data cleanup...');
  
  // Delete all dummy orders except the real test ones
  db.run(`DELETE FROM orders WHERE 
    tracking_number LIKE 'FOLSME%' OR 
    customer_email LIKE '%@email.com' OR
    customer_name IN ('John Adebayo', 'Mary Okafor', 'Ibrahim Musa', 'Grace Eze', 'Ahmed Hassan')`, 
    function(err) {
      if (err) {
        console.error('❌ Error cleaning dummy orders:', err);
        return res.status(500).json({ success: false, message: 'Failed to cleanup orders' });
      }
      
      console.log(`✅ Cleaned up ${this.changes} dummy orders`);
      
      // Delete dummy customers
      db.run(`DELETE FROM customers WHERE email LIKE '%@email.com'`, function(err) {
        if (err) {
          console.error('❌ Error cleaning dummy customers:', err);
        } else {
          console.log(`✅ Cleaned up ${this.changes} dummy customers`);
        }
        
        // Add test mineral at ₦100
        const testMineralSpecs = JSON.stringify([
          'Type: Test Mineral',
          'Grade: Sample Grade', 
          'Purity: 95%',
          'Unit: per kg',
          'Availability: In Stock',
          'DisplayType: both'
        ]);
        
        db.run(`INSERT OR REPLACE INTO products 
          (name, description, price_cents, category, specs, stock_quantity, is_active)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ['Test Mineral Sample', 'Sample mineral for testing checkout at ₦100', 10000, 'mineral', testMineralSpecs, 10, 1],
          function(err) {
            if (err) {
              console.error('❌ Error adding test mineral:', err);
            } else {
              console.log('✅ Added test mineral at ₦100');
            }
            
            res.json({ 
              success: true, 
              message: 'Dummy data cleanup completed successfully',
              details: {
                ordersDeleted: this.changes || 0,
                testMineralAdded: !err
              }
            });
          });
      });
    });
});

// Delete old/delivered orders (order management)
app.delete('/api/admin/orders/cleanup', authenticateToken, (req, res) => {
  try {
    const { olderThanDays = 365, status = 'delivered' } = req.query;
    
    // Calculate date threshold
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - parseInt(olderThanDays));
    const thresholdISO = thresholdDate.toISOString();
    
    console.log(`🧹 Cleaning up orders older than ${olderThanDays} days with status '${status}'`);
    
    db.run(`DELETE FROM orders 
            WHERE status = ? AND created_at < ?`,
      [status, thresholdISO],
      function(err) {
        if (err) {
          console.error('❌ Error cleaning up orders:', err);
          res.status(500).json({ success: false, message: 'Failed to cleanup orders' });
        } else {
          console.log('✅ Cleaned up', this.changes, 'old orders');
          res.json({ 
            success: true, 
            message: `Successfully cleaned up ${this.changes} old orders`,
            deletedCount: this.changes
          });
        }
      });
      
  } catch (error) {
    console.error('❌ Order cleanup error:', error);
    res.status(500).json({ success: false, message: 'Order cleanup failed' });
  }
});

// Update single order status
app.put('/api/admin/orders/:id/status', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    console.log(`🔄 Updating order ${id} status to: ${status}`);
    
    if (!status) {
      return res.status(400).json({ success: false, message: 'Status is required' });
    }
    
    const validStatuses = ['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    
    db.run(`UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, 
      [status, id], function(err) {
      if (err) {
        console.error('❌ Error updating order status:', err);
        res.status(500).json({ success: false, message: 'Failed to update order status' });
      } else if (this.changes === 0) {
        res.status(404).json({ success: false, message: 'Order not found' });
      } else {
        console.log(`✅ Updated order ${id} to status: ${status}`);
        res.json({ 
          success: true, 
          message: `Order status updated to ${status}`,
          orderId: id,
          newStatus: status
        });
      }
    });
  } catch (error) {
    console.error('❌ Error in order status update:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Bulk update order status
app.put('/api/admin/orders/bulk-update', authenticateToken, (req, res) => {
  try {
    const { orderIds, newStatus } = req.body;
    
    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Order IDs are required' });
    }
    
    const placeholders = orderIds.map(() => '?').join(',');
    const query = `UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`;
    
    db.run(query, [newStatus, ...orderIds], function(err) {
      if (err) {
        console.error('❌ Error bulk updating orders:', err);
        res.status(500).json({ success: false, message: 'Failed to update orders' });
      } else {
        console.log('✅ Bulk updated', this.changes, 'orders to status:', newStatus);
        res.json({ 
          success: true, 
          message: `Successfully updated ${this.changes} orders to ${newStatus}`,
          updatedCount: this.changes
        });
      }
    });
    
  } catch (error) {
    console.error('❌ Bulk update error:', error);
    res.status(500).json({ success: false, message: 'Bulk update failed' });
  }
});

// Paystack payment verification endpoint
app.post('/api/verify-payment', async (req, res) => {
  const { reference } = req.body;
  
  if (!reference) {
    return res.status(400).json({ success: false, message: 'Payment reference is required' });
  }

  try {
    const paystackSecretKey = process.env.PAYSTACK_SECRET_KEY;
    
    const response = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${paystackSecretKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const data = await response.json();
    
    if (data.status && data.data.status === 'success') {
      // Payment verified successfully
      console.log('✅ Payment verified:', reference);
      
      res.json({ 
        success: true, 
        message: 'Payment verified successfully',
        data: data.data 
      });
    } else {
      console.log('❌ Payment verification failed:', reference);
      res.status(400).json({ 
        success: false, 
        message: 'Payment verification failed'
      });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Payment verification error'
    });
  }
});

// Orders endpoint for checkout
app.post('/api/orders', async (req, res) => {
  try {
    const orderData = req.body;
    const orderNumber = 'FS_' + Date.now();
    
    console.log('📦 New order received:', orderNumber);
    console.log('📋 Order data:', orderData);
    
    // Extract order information
    const {
      formData,
      cartItems,
      subtotal,
      shipping,
      total,
      paymentMethod,
      paymentReference,
      paymentStatus
    } = orderData;
    
    // Create or find customer
    db.get('SELECT id FROM customers WHERE email = ?', [formData.email], (err, customer) => {
      if (err) {
        console.error('❌ Database error:', err);
        return res.status(500).json({ success: false, message: 'Database error' });
      }
      
      const processOrder = (customerId) => {
        // Process each cart item as a separate order
        let ordersCreated = 0;
        const totalOrders = cartItems.length;
        
        cartItems.forEach((item, index) => {
          const itemTotal = item.price * item.quantity;
          const shippingPerItem = Math.round(shipping / totalOrders);
          
          db.run(`INSERT INTO orders (
            customer_id, customer_name, customer_email, customer_phone,
            product_id, quantity, total_amount_cents, status, tracking_number,
            shipping_address, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            customerId,
            formData.fullName,
            formData.email,
            formData.phone,
            item.id,
            item.quantity,
            itemTotal + shippingPerItem,
            paymentStatus === 'verified' ? 'confirmed' : 'pending',
            orderNumber + '_' + (index + 1),
            `${formData.street}, ${formData.city}, ${formData.state}, ${formData.country}`
          ], function(orderErr) {
            if (orderErr) {
              console.error('❌ Error creating order:', orderErr);
            } else {
              console.log('✅ Order created with ID:', this.lastID);
              ordersCreated++;
              
              // If all orders created, update customer stats
              if (ordersCreated === totalOrders) {
                db.run(`UPDATE customers SET 
                        total_orders = total_orders + ?,
                        total_spent_cents = total_spent_cents + ?
                        WHERE id = ?`,
                [totalOrders, total, customerId]);
              }
            }
          });
        });
      };
      
      if (customer) {
        // Existing customer
        processOrder(customer.id);
      } else {
        // Create new customer
        db.run(`INSERT INTO customers (
          name, email, phone, address, city, state, country,
          total_orders, total_spent_cents
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          formData.fullName,
          formData.email,
          formData.phone,
          formData.street,
          formData.city,
          formData.state,
          formData.country,
          cartItems.length,
          total
        ], function(customerErr) {
          if (customerErr) {
            console.error('❌ Error creating customer:', customerErr);
            return res.status(500).json({ success: false, message: 'Failed to create customer' });
          }
          
          console.log('✅ New customer created with ID:', this.lastID);
          processOrder(this.lastID);
        });
      }
    });
    
    res.json({
      success: true,
      message: 'Order created successfully',
      orderNumber: orderNumber
    });
    
  } catch (error) {
    console.error('❌ Order creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create order'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 FOLSME Admin Server running on port ${PORT}`);
  console.log(`📊 Admin Dashboard: http://localhost:${PORT}/admin`);
  console.log(`🌐 Website: Open index.html in browser`);
  console.log(`🔑 Login: admin / admin123`);
});

module.exports = app;