  const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

const app = express();
const PORT = process.env.PORT || 54112;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:8080', 'https://folsme.com', 'https://admin.folsme.com'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  secret: 'folsme-admin-session',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false, maxAge: 24 * 60 * 60 * 1000 } // 24 hours
}));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../public/uploads/'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'generator-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// Create uploads directory if it doesn't exist
const fs = require('fs');
const uploadsDir = path.join(__dirname, '../public/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve static files from public folder
app.use(express.static(path.join(__dirname, '../public')));

// Database setup
const db = new sqlite3.Database(path.join(__dirname, './data/database.sqlite'), (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Customers table
  db.run(`
    CREATE TABLE IF NOT EXISTS customers (
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
    )
  `);

  // Products table
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price_cents INTEGER NOT NULL,
      category TEXT NOT NULL,
      specs TEXT, -- JSON string
      images TEXT, -- JSON string
      stock_quantity INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT 1,
      seo_title TEXT,
      seo_description TEXT,
      seo_keywords TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Orders table (enhanced)
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      product_id INTEGER,
      quantity INTEGER NOT NULL,
      total_amount_cents INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      fulfillment_status TEXT DEFAULT 'unfulfilled',
      shipping_address TEXT,
      tracking_number TEXT,
      payment_status TEXT DEFAULT 'pending',
      invoice_number TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products (id),
      FOREIGN KEY (customer_id) REFERENCES customers (id)
    )
  `);

  // Blog posts table
  db.run(`
    CREATE TABLE IF NOT EXISTS blog_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      content TEXT NOT NULL,
      excerpt TEXT,
      featured_image TEXT,
      status TEXT DEFAULT 'draft',
      seo_title TEXT,
      seo_description TEXT,
      author_id INTEGER,
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (author_id) REFERENCES users (id)
    )
  `);

  // Website content table
  db.run(`
    CREATE TABLE IF NOT EXISTS website_content (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page TEXT NOT NULL,
      section TEXT NOT NULL,
      content_key TEXT NOT NULL,
      content_value TEXT NOT NULL,
      content_type TEXT DEFAULT 'text',
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(page, section, content_key)
    )
  `);

  // Image gallery table
  db.run(`
    CREATE TABLE IF NOT EXISTS gallery_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      mime_type TEXT,
      alt_text TEXT,
      category TEXT DEFAULT 'general',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Returns/refunds table
  db.run(`
    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      refund_amount_cents INTEGER,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders (id)
    )
  `);

  // Achievements table
  db.run(`
    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      year INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      stats TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Achievement images table
  db.run(`
    CREATE TABLE IF NOT EXISTS achievement_images (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      image_url TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Create default admin user
  createDefaultAdmin();
  initializeDefaultContent();
  initializeSampleData();
}

// Create default admin user
function createDefaultAdmin() {
  const defaultUsername = 'admin';
  const defaultPassword = 'admin123';

  db.get('SELECT * FROM users WHERE username = ?', [defaultUsername], (err, row) => {
    if (err) {
      console.error('Error checking for default admin:', err);
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
              console.error('Error creating default admin:', err);
            } else {
              console.log('Default admin user created (username: admin, password: admin123)');
            }
          });
      });
    }
  });
}

// Initialize default website content
function initializeDefaultContent() {
  // Wait a bit to ensure tables are created
  setTimeout(() => {
    const defaultContent = [
      { page: 'homepage', section: 'hero', content_key: 'title', content_value: 'FOLSME International Ltd' },
      { page: 'homepage', section: 'hero', content_key: 'subtitle', content_value: 'Leading Nigeria\'s Industrial Growth' },
      { page: 'homepage', section: 'about', content_key: 'title', content_value: 'About FOLSME International' },
      { page: 'homepage', section: 'about', content_key: 'description', content_value: 'Since 2015, FOLSME International Limited has been at the forefront of Nigeria\'s industrial transformation.' }
    ];

    defaultContent.forEach(item => {
      db.run(`
        INSERT OR IGNORE INTO website_content (page, section, content_key, content_value)
        VALUES (?, ?, ?, ?)
      `, [item.page, item.section, item.content_key, item.content_value], (err) => {
        if (err) {
          console.error('Error inserting default content:', err);
        }
      });
    });

    // Initialize default achievements
    const defaultAchievements = [
      {
        year: 2015,
        title: 'Company Foundation',
        description: 'FOLSME International Limited was established with a vision to transform Nigeria\'s industrial landscape through innovative mining and energy solutions.',
        stats: 'CAC Registered, First Office, 3 Founding Members'
      },
      {
        year: 2018,
        title: 'First Major Mining Contract',
        description: 'Secured our first major mining contract in Erio-Ekiti, establishing our reputation in solid mineral extraction and processing.',
        stats: '500+ Tonnes Processed, 10 Employees, 2 Mining Sites'
      },
      {
        year: 2020,
        title: 'Energy Division Launch',
        description: 'Expanded into renewable energy solutions with our magnetic generator technology, providing sustainable power alternatives across Nigeria.',
        stats: '50+ Generators Installed, 25 Employees, 3 States Coverage'
      },
      {
        year: 2023,
        title: 'Multi-State Operations',
        description: 'Expanded operations across multiple Nigerian states, becoming a recognized leader in mining, energy, and industrial services with nationwide reach.',
        stats: '5 States, 100+ Projects, 50+ Employees, 1000+ Customers'
      }
    ];

    defaultAchievements.forEach(achievement => {
      db.run(`
        INSERT OR IGNORE INTO achievements (year, title, description, stats)
        VALUES (?, ?, ?, ?)
      `, [achievement.year, achievement.title, achievement.description, achievement.stats], (err) => {
        if (err) {
          console.error('Error inserting default achievement:', err);
        }
      });
    });
  }, 1000);
}

// Initialize sample data for analytics
function initializeSampleData() {
  setTimeout(() => {
    // Add comprehensive sample customers
    const sampleCustomers = [
      { name: 'John Adebayo', email: 'john.adebayo@email.com', phone: '+234 801 234 5678', address: '15 Victoria Island Road', city: 'Lagos', state: 'Lagos' },
      { name: 'Mary Okafor', email: 'mary.okafor@email.com', phone: '+234 802 345 6789', address: '23 Garki District', city: 'Abuja', state: 'FCT' },
      { name: 'Ibrahim Musa', email: 'ibrahim.musa@email.com', phone: '+234 803 456 7890', address: '45 Sabon Gari', city: 'Kano', state: 'Kano' },
      { name: 'Grace Eze', email: 'grace.eze@email.com', phone: '+234 804 567 8901', address: '12 Trans Amadi', city: 'Port Harcourt', state: 'Rivers' },
      { name: 'Ahmed Hassan', email: 'ahmed.hassan@email.com', phone: '+234 805 678 9012', address: '8 Barnawa Estate', city: 'Kaduna', state: 'Kaduna' },
      { name: 'Fatima Bello', email: 'fatima.bello@email.com', phone: '+234 806 789 0123', address: '33 GRA Phase 2', city: 'Maiduguri', state: 'Borno' },
      { name: 'Chinedu Okoro', email: 'chinedu.okoro@email.com', phone: '+234 807 890 1234', address: '67 New Haven', city: 'Enugu', state: 'Enugu' },
      { name: 'Aisha Abdullahi', email: 'aisha.abdullahi@email.com', phone: '+234 808 901 2345', address: '21 Tudun Wada', city: 'Jos', state: 'Plateau' },
      { name: 'Emeka Nwosu', email: 'emeka.nwosu@email.com', phone: '+234 809 012 3456', address: '89 Owerri Road', city: 'Owerri', state: 'Imo' },
      { name: 'Zainab Yusuf', email: 'zainab.yusuf@email.com', phone: '+234 810 123 4567', address: '14 Sokoto Road', city: 'Sokoto', state: 'Sokoto' },
      { name: 'Olumide Adeyemi', email: 'olumide.adeyemi@email.com', phone: '+234 811 234 5678', address: '56 Bodija Estate', city: 'Ibadan', state: 'Oyo' },
      { name: 'Blessing Okon', email: 'blessing.okon@email.com', phone: '+234 812 345 6789', address: '78 Calabar Road', city: 'Calabar', state: 'Cross River' },
      { name: 'Murtala Sani', email: 'murtala.sani@email.com', phone: '+234 813 456 7890', address: '92 Birnin Kebbi', city: 'Birnin Kebbi', state: 'Kebbi' },
      { name: 'Chioma Ugwu', email: 'chioma.ugwu@email.com', phone: '+234 814 567 8901', address: '36 Awka Road', city: 'Awka', state: 'Anambra' },
      { name: 'Yakubu Garba', email: 'yakubu.garba@email.com', phone: '+234 815 678 9012', address: '41 Lafia Street', city: 'Lafia', state: 'Nasarawa' }
    ];

    sampleCustomers.forEach(customer => {
      db.run(`
        INSERT OR IGNORE INTO customers (name, email, phone, city, state, total_orders, total_spent_cents)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [customer.name, customer.email, customer.phone, customer.city, customer.state, 0, 0]);
    });

    // Add comprehensive sample products
    const sampleProducts = [
      {
        name: '5kW Residential Magnetic Generator',
        description: 'Compact magnetic generator perfect for residential use, providing clean and reliable power',
        price_cents: 250000000, // ₦2,500,000
        category: 'generator',
        specs: JSON.stringify(['Power: 5kW', 'Fuel: Magnetic Technology', 'Features: Quiet Operation, Low Maintenance', 'Warranty: 2 Years']),
        images: JSON.stringify(['/uploads/generator-5kw.jpg'])
      },
      {
        name: '15kW Commercial Magnetic Generator',
        description: 'Heavy-duty generator for commercial and industrial applications with 24/7 operation capability',
        price_cents: 750000000, // ₦7,500,000
        category: 'generator',
        specs: JSON.stringify(['Power: 15kW', 'Fuel: Magnetic Technology', 'Features: Industrial Grade, 24/7 Operation', 'Warranty: 3 Years']),
        images: JSON.stringify(['/uploads/generator-15kw.jpg'])
      },
      {
        name: '25kW Industrial Magnetic Generator',
        description: 'High-capacity generator for large industrial facilities and manufacturing plants',
        price_cents: 1200000000, // ₦12,000,000
        category: 'generator',
        specs: JSON.stringify(['Power: 25kW', 'Fuel: Magnetic Technology', 'Features: Heavy Duty, Continuous Operation', 'Warranty: 5 Years']),
        images: JSON.stringify(['/uploads/generator-25kw.jpg'])
      },
      {
        name: 'High Grade Gold Ore',
        description: 'Premium quality gold ore from our Erio-Ekiti mining operations with 95% purity',
        price_cents: 5000000, // ₦50,000 per kg
        category: 'mineral',
        specs: JSON.stringify(['Type: Gold Ore', 'Grade: High Grade', 'Purity: 95%', 'Origin: Erio-Ekiti Mining Site', 'Unit: per kg', 'DisplayType: both']),
        images: JSON.stringify(['/uploads/gold-ore.jpg'])
      },
      {
        name: 'Premium Limestone',
        description: 'High-quality limestone suitable for cement production and construction industry',
        price_cents: 1500000, // ₦15,000 per tonne
        category: 'mineral',
        specs: JSON.stringify(['Type: Limestone', 'Grade: Premium', 'Purity: 98%', 'Origin: Ewekoro Quarry', 'Unit: per tonne', 'DisplayType: both']),
        images: JSON.stringify(['/uploads/limestone.jpg'])
      },
      {
        name: 'Iron Ore Concentrate',
        description: 'High-grade iron ore concentrate for steel production and metallurgical applications',
        price_cents: 2500000, // ₦25,000 per tonne
        category: 'mineral',
        specs: JSON.stringify(['Type: Iron Ore', 'Grade: Concentrate', 'Purity: 92%', 'Origin: Itakpe Mines', 'Unit: per tonne', 'DisplayType: both']),
        images: JSON.stringify(['/uploads/iron-ore.jpg'])
      },
      {
        name: 'Kaolin Clay',
        description: 'Pure kaolin clay for ceramics, paper production, and pharmaceutical applications',
        price_cents: 800000, // ₦8,000 per tonne
        category: 'mineral',
        specs: JSON.stringify(['Type: Kaolin', 'Grade: Industrial Grade', 'Purity: 99%', 'Origin: Kankara Deposits', 'Unit: per tonne', 'DisplayType: both']),
        images: JSON.stringify(['/uploads/kaolin.jpg'])
      },
      {
        name: 'Barite Mineral',
        description: 'High-density barite for oil drilling operations and industrial applications',
        price_cents: 3500000, // ₦35,000 per tonne
        category: 'mineral',
        specs: JSON.stringify(['Type: Barite', 'Grade: Drilling Grade', 'Density: 4.2 g/cm³', 'Origin: Cross River State', 'Unit: per tonne', 'DisplayType: both']),
        images: JSON.stringify(['/uploads/barite.jpg'])
      }
    ];

    sampleProducts.forEach(product => {
      db.run(`
        INSERT OR IGNORE INTO products (name, description, price_cents, category, specs, images, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [product.name, product.description, product.price_cents, product.category, product.specs, product.images, 1]);
    });

    // Add sample orders (after a delay to ensure customers and products exist)
    setTimeout(() => {
      // Get customer and product IDs
      db.all('SELECT id FROM customers LIMIT 5', [], (err, customers) => {
        if (err || !customers.length) return;
        
        db.all('SELECT id, name, price_cents FROM products LIMIT 3', [], (err, products) => {
          if (err || !products.length) return;

          // Create comprehensive sample orders
          const sampleOrders = [
            {
              customer_id: customers[0].id,
              customer_name: 'John Adebayo',
              customer_email: 'john.adebayo@email.com',
              customer_phone: '+234 801 234 5678',
              product_id: products[0].id,
              quantity: 1,
              total_amount_cents: products[0].price_cents,
              status: 'delivered',
              tracking_number: 'FOLSME001',
              shipping_address: '15 Victoria Island Road, Lagos',
              created_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
              customer_id: customers[1].id,
              customer_name: 'Mary Okafor',
              customer_email: 'mary.okafor@email.com',
              customer_phone: '+234 802 345 6789',
              product_id: products[1].id,
              quantity: 1,
              total_amount_cents: products[1].price_cents,
              status: 'shipped',
              tracking_number: 'FOLSME002',
              shipping_address: '23 Garki District, Abuja',
              created_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
              customer_id: customers[2].id,
              customer_name: 'Ibrahim Musa',
              customer_email: 'ibrahim.musa@email.com',
              customer_phone: '+234 803 456 7890',
              product_id: products[3].id, // Gold ore
              quantity: 50, // 50kg
              total_amount_cents: products[3].price_cents * 50,
              status: 'processing',
              shipping_address: '45 Sabon Gari, Kano',
              created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
              customer_id: customers[3].id,
              customer_name: 'Grace Eze',
              customer_email: 'grace.eze@email.com',
              customer_phone: '+234 804 567 8901',
              product_id: products[2].id, // 25kW generator
              quantity: 1,
              total_amount_cents: products[2].price_cents,
              status: 'delivered',
              tracking_number: 'FOLSME003',
              shipping_address: '12 Trans Amadi, Port Harcourt',
              created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
              customer_id: customers[4].id,
              customer_name: 'Ahmed Hassan',
              customer_email: 'ahmed.hassan@email.com',
              customer_phone: '+234 805 678 9012',
              product_id: products[4].id, // Limestone
              quantity: 100, // 100 tonnes
              total_amount_cents: products[4].price_cents * 100,
              status: 'pending',
              shipping_address: '8 Barnawa Estate, Kaduna',
              created_at: new Date().toISOString()
            },
            {
              customer_id: customers[5].id,
              customer_name: 'Fatima Bello',
              customer_email: 'fatima.bello@email.com',
              customer_phone: '+234 806 789 0123',
              product_id: products[0].id, // 5kW generator
              quantity: 3,
              total_amount_cents: products[0].price_cents * 3,
              status: 'shipped',
              tracking_number: 'FOLSME004',
              shipping_address: '33 GRA Phase 2, Maiduguri',
              created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
              customer_id: customers[6].id,
              customer_name: 'Chinedu Okoro',
              customer_email: 'chinedu.okoro@email.com',
              customer_phone: '+234 807 890 1234',
              product_id: products[5].id, // Iron ore
              quantity: 200, // 200 tonnes
              total_amount_cents: products[5].price_cents * 200,
              status: 'delivered',
              tracking_number: 'FOLSME005',
              shipping_address: '67 New Haven, Enugu',
              created_at: new Date(Date.now() - 21 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
              customer_id: customers[7].id,
              customer_name: 'Aisha Abdullahi',
              customer_email: 'aisha.abdullahi@email.com',
              customer_phone: '+234 808 901 2345',
              product_id: products[1].id, // 15kW generator
              quantity: 2,
              total_amount_cents: products[1].price_cents * 2,
              status: 'processing',
              shipping_address: '21 Tudun Wada, Jos',
              created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
              customer_id: customers[8].id,
              customer_name: 'Emeka Nwosu',
              customer_email: 'emeka.nwosu@email.com',
              customer_phone: '+234 809 012 3456',
              product_id: products[6].id, // Kaolin
              quantity: 50, // 50 tonnes
              total_amount_cents: products[6].price_cents * 50,
              status: 'delivered',
              tracking_number: 'FOLSME006',
              shipping_address: '89 Owerri Road, Owerri',
              created_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
            },
            {
              customer_id: customers[9].id,
              customer_name: 'Zainab Yusuf',
              customer_email: 'zainab.yusuf@email.com',
              customer_phone: '+234 810 123 4567',
              product_id: products[7].id, // Barite
              quantity: 75, // 75 tonnes
              total_amount_cents: products[7].price_cents * 75,
              status: 'shipped',
              tracking_number: 'FOLSME007',
              shipping_address: '14 Sokoto Road, Sokoto',
              created_at: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString()
            }
          ];

          sampleOrders.forEach(order => {
            db.run(`
              INSERT OR IGNORE INTO orders (customer_id, customer_name, customer_email, customer_phone, product_id, quantity, total_amount_cents, status, tracking_number, shipping_address, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `, [order.customer_id, order.customer_name, order.customer_email, order.customer_phone, order.product_id, order.quantity, order.total_amount_cents, order.status, order.tracking_number, order.shipping_address, order.created_at]);
          });

          // Update customer totals
          setTimeout(() => {
            db.run(`
              UPDATE customers SET 
                total_orders = (SELECT COUNT(*) FROM orders WHERE customer_id = customers.id),
                total_spent_cents = (SELECT COALESCE(SUM(total_amount_cents), 0) FROM orders WHERE customer_id = customers.id AND status != 'cancelled')
            `);
          }, 1000);
        });
      });
    }, 2000);

    // Add sample blog posts
    setTimeout(() => {
      const sampleBlogPosts = [
        {
          title: 'FOLSME International: Leading Nigeria\'s Industrial Revolution',
          slug: 'folsme-leading-nigeria-industrial-revolution',
          content: 'Since our establishment in 2015, FOLSME International Limited has been at the forefront of Nigeria\'s industrial transformation. Our commitment to excellence in mining, energy solutions, and industrial services has positioned us as a trusted partner for businesses across Nigeria.\n\nOur journey began with a simple vision: to harness Nigeria\'s abundant natural resources while providing innovative energy solutions that drive economic growth. Today, we operate across multiple states, serving hundreds of satisfied customers with our premium products and services.\n\nFrom our mining operations in Erio-Ekiti to our magnetic generator manufacturing facilities, we continue to set new standards in quality, reliability, and customer satisfaction.',
          excerpt: 'Discover how FOLSME International has become a leading force in Nigeria\'s industrial sector since 2015.',
          status: 'published',
          published_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          title: 'The Future of Clean Energy: Magnetic Generator Technology',
          slug: 'future-clean-energy-magnetic-generator-technology',
          content: 'As Nigeria continues to face energy challenges, innovative solutions are needed to meet the growing demand for reliable, clean power. At FOLSME International, we\'ve invested heavily in magnetic generator technology that represents the future of sustainable energy.\n\nOur magnetic generators offer several advantages over traditional power sources:\n\n• Zero fuel consumption after installation\n• Minimal maintenance requirements\n• Silent operation suitable for residential areas\n• Environmentally friendly with zero emissions\n• Long-term cost savings for businesses and homes\n\nWith installations across Lagos, Abuja, Kano, and other major cities, our magnetic generators are already powering Nigeria\'s future.',
          excerpt: 'Learn about the revolutionary magnetic generator technology that\'s transforming Nigeria\'s energy landscape.',
          status: 'published',
          published_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          title: 'Mining Excellence: Our Operations in Erio-Ekiti',
          slug: 'mining-excellence-operations-erio-ekiti',
          content: 'Our mining operations in Erio-Ekiti represent the gold standard of responsible mineral extraction in Nigeria. With state-of-the-art equipment and adherence to international safety standards, we\'ve successfully extracted and processed over 500 tonnes of high-grade minerals.\n\nOur mining site features:\n\n• Modern extraction equipment\n• Environmental protection measures\n• Local community employment opportunities\n• Strict safety protocols\n• Quality assurance at every stage\n\nWe\'re proud to contribute to Nigeria\'s mineral wealth while maintaining the highest standards of environmental responsibility and community engagement.',
          excerpt: 'Explore our world-class mining operations and commitment to sustainable mineral extraction.',
          status: 'published',
          published_at: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          title: 'Expanding Across Nigeria: Our Multi-State Operations',
          slug: 'expanding-across-nigeria-multi-state-operations',
          content: 'What started as a local operation has grown into a nationwide network serving customers across multiple Nigerian states. Our expansion strategy focuses on bringing quality products and services closer to our customers while maintaining our commitment to excellence.\n\nCurrently, we operate in:\n\n• Lagos - Commercial hub operations\n• Abuja - Government and corporate clients\n• Kano - Northern region distribution\n• Port Harcourt - Oil and gas sector services\n• Kaduna - Industrial manufacturing support\n\nEach location is staffed with trained professionals who understand local market needs and can provide personalized service to our valued customers.',
          excerpt: 'Discover how FOLSME International has expanded to serve customers across Nigeria.',
          status: 'published',
          published_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString()
        },
        {
          title: 'Quality Assurance: Our Commitment to Excellence',
          slug: 'quality-assurance-commitment-excellence',
          content: 'At FOLSME International, quality isn\'t just a buzzword – it\'s the foundation of everything we do. From mineral extraction to generator manufacturing, every process is governed by strict quality control measures that ensure our customers receive only the best.\n\nOur quality assurance program includes:\n\n• ISO-compliant processes\n• Regular third-party audits\n• Continuous staff training\n• Customer feedback integration\n• Performance monitoring systems\n\nThis commitment to quality has earned us the trust of over 1,000 customers and established our reputation as Nigeria\'s premier industrial services provider.',
          excerpt: 'Learn about our comprehensive quality assurance program and commitment to customer satisfaction.',
          status: 'draft'
        }
      ];

      sampleBlogPosts.forEach(post => {
        db.run(`
          INSERT OR IGNORE INTO blog_posts (title, slug, content, excerpt, status, published_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [post.title, post.slug, post.content, post.excerpt, post.status, post.published_at, new Date().toISOString()]);
      });
    }, 4000);
  }, 3000);
}

// Email configuration
const emailTransporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: process.env.SMTP_PORT || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASS || 'your-app-password'
  }
});

// Send email notification
async function sendEmailNotification(to, subject, html) {
  try {
    await emailTransporter.sendMail({
      from: process.env.SMTP_FROM || 'FOLSME International <noreply@folsme.com>',
      to,
      subject,
      html
    });
    console.log('Email sent successfully to:', to);
  } catch (error) {
    console.error('Error sending email:', error);
  }
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

// Routes

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
        secure: false, // Set to true in production with HTTPS
        maxAge: 24 * 60 * 60 * 1000
      });

      res.json({
        success: true,
        message: 'Login successful',
        user: { id: user.id, username: user.username, role: user.role }
      });
    });
  });
});

// Public Blog API (for frontend)
app.get('/api/blog', (req, res) => {
  db.all('SELECT * FROM blog_posts WHERE status = "published" ORDER BY published_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, posts: rows });
  });
});

// Get single blog post by slug (for frontend)
app.get('/api/blog/:slug', (req, res) => {
  const { slug } = req.params;
  db.get('SELECT * FROM blog_posts WHERE slug = ? AND status = "published"', [slug], (err, row) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    if (!row) {
      return res.status(404).json({ success: false, message: 'Post not found' });
    }
    res.json({ success: true, post: row });
  });
});

// Achievements Management
app.get('/api/achievements', (req, res) => {
  db.all('SELECT * FROM achievements WHERE is_active = 1 ORDER BY year DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, achievements: rows });
  });
});

app.get('/api/achievement-images', (req, res) => {
  db.all('SELECT * FROM achievement_images WHERE is_active = 1 ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, images: rows });
  });
});

// Admin achievements management
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
  
  db.run(`
    INSERT INTO achievements (year, title, description, stats)
    VALUES (?, ?, ?, ?)
  `, [year, title, description, stats], function(err) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Achievement added successfully', id: this.lastID });
  });
});

app.put('/api/admin/achievements/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { year, title, description, stats, is_active } = req.body;
  
  db.run(`
    UPDATE achievements 
    SET year = ?, title = ?, description = ?, stats = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [year, title, description, stats, is_active !== undefined ? is_active : 1, id], (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Achievement updated successfully' });
  });
});

app.delete('/api/admin/achievements/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM achievements WHERE id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Achievement deleted successfully' });
  });
});

// Admin achievement images management
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
  
  db.run(`
    INSERT INTO achievement_images (title, image_url)
    VALUES (?, ?)
  `, [title, imageUrl], function(err) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Achievement image added successfully', id: this.lastID });
  });
});

app.delete('/api/admin/achievement-images/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.run('DELETE FROM achievement_images WHERE id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, message: 'Achievement image deleted successfully' });
  });
});

// Logout
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logout successful' });
});

// Enhanced search for orders
app.get('/api/admin/orders/search', authenticateToken, (req, res) => {
  const { q, status, date_from, date_to } = req.query;
  
  let query = `
    SELECT o.*, p.name as product_name, c.name as customer_name, c.email as customer_email
    FROM orders o
    LEFT JOIN products p ON o.product_id = p.id
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE 1=1
  `;
  
  const params = [];
  
  if (q) {
    query += ` AND (o.customer_name LIKE ? OR o.customer_email LIKE ? OR p.name LIKE ? OR o.invoice_number LIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  
  if (status) {
    query += ` AND o.status = ?`;
    params.push(status);
  }
  
  if (date_from) {
    query += ` AND DATE(o.created_at) >= ?`;
    params.push(date_from);
  }
  
  if (date_to) {
    query += ` AND DATE(o.created_at) <= ?`;
    params.push(date_to);
  }
  
  query += ` ORDER BY o.created_at DESC`;
  
  db.all(query, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Search failed', error: err.message });
    }
    
    res.json({ success: true, orders: rows });
  });
});

// Get all products
app.get('/api/products', (req, res) => {
  db.all('SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    // Parse JSON fields
    const products = rows.map(product => ({
      ...product,
      specs: product.specs ? JSON.parse(product.specs) : [],
      images: product.images ? JSON.parse(product.images) : []
    }));

    res.json({ success: true, products });
  });
});

// Get single product by ID (for editing)
app.get('/api/admin/products/:id', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get('SELECT * FROM products WHERE id = ?', [id], (err, row) => {
    if (err) {
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

    res.json({ success: true, product });
  });
});

// Get all minerals for mining page
app.get('/api/minerals', (req, res) => {
  db.all('SELECT * FROM products WHERE category = "mineral" AND is_active = 1 ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    // Parse JSON fields and format for mining page
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
        specs: specs
      };
    });

    res.json({ success: true, minerals });
  });
});

// Get minerals for showcase section only ("Minerals We Deal In")
app.get('/api/minerals/showcase', (req, res) => {
  db.all('SELECT * FROM products WHERE category = "mineral" AND is_active = 1 ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    // Parse and filter for showcase display
    const minerals = rows.map(product => {
      const specs = product.specs ? JSON.parse(product.specs) : [];
      const images = product.images ? JSON.parse(product.images) : [];
      
      const displayTypeSpec = specs.find(spec => spec.startsWith('DisplayType:'));
      const displayType = displayTypeSpec ? displayTypeSpec.replace('DisplayType: ', '') : 'both';
      
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        image: images.length > 0 ? images[0] : '/images/minerals/default.jpg',
        displayType: displayType,
        specs: specs
      };
    }).filter(mineral => mineral.displayType === 'showcase' || mineral.displayType === 'both');

    res.json({ success: true, minerals });
  });
});

// Get minerals for buy section only ("Buy Mineral Resources")
app.get('/api/minerals/buy', (req, res) => {
  db.all('SELECT * FROM products WHERE category = "mineral" AND is_active = 1 ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    // Parse and filter for buy display
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
      
      const displayType = displayTypeSpec ? displayTypeSpec.replace('DisplayType: ', '') : 'both';
      
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
        displayType: displayType,
        specs: specs
      };
    }).filter(mineral => mineral.displayType === 'for-sale' || mineral.displayType === 'both');

    res.json({ success: true, minerals });
  });
});

// Admin routes (protected)
app.get('/api/admin/products', authenticateToken, (req, res) => {
  db.all('SELECT * FROM products ORDER BY created_at DESC', [], (err, rows) => {
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

// Create product with file upload
app.post('/api/admin/products', authenticateToken, upload.single('image'), (req, res) => {
  const {
    name, description, price_cents, category,
    // Generator fields
    power, fuel, features, usage_description,
    // Mineral fields
    mineral_type, grade, origin
  } = req.body;

  // Build specs array based on category
  const specs = [];

  if (category === 'generator') {
    // Generator specs
    if (power) specs.push(`Power: ${power}`);
    if (fuel) specs.push(`Fuel: ${fuel}`);
    if (req.body.generator_category) specs.push(`Category: ${req.body.generator_category}`);
    if (req.body.availability) specs.push(`Availability: ${req.body.availability}`);
    if (features && features.trim()) {
      const featuresList = features.split('\n').map(f => f.trim()).filter(f => f);
      if (featuresList.length > 0) specs.push(`Features: ${featuresList.join(', ')}`);
    }
  } else if (category === 'mineral') {
    // Mineral specs
    if (mineral_type) specs.push(`Type: ${mineral_type}`);
    if (grade) specs.push(`Grade: ${grade}`);
    if (origin) specs.push(`Origin: ${origin}`);
    if (req.body.price_per_unit) specs.push(`Price: ₦${req.body.price_per_unit}`);
    if (req.body.unit) specs.push(`Unit: ${req.body.unit}`);
    if (req.body.availability) specs.push(`Availability: ${req.body.availability}`);
    if (req.body.purity) specs.push(`Purity: ${req.body.purity}`);
    if (req.body.display_type) specs.push(`DisplayType: ${req.body.display_type}`);
  }

  const specsJson = JSON.stringify(specs);

  // Handle image upload
  let imagesJson = JSON.stringify([]);
  if (req.file) {
    const imageUrl = `/uploads/${req.file.filename}`;
    imagesJson = JSON.stringify([imageUrl]);
  }

  // Use appropriate description field
  const finalDescription = category === 'generator' ? (usage_description || description) : description;

  db.run(`
    INSERT INTO products (name, description, price_cents, category, specs, images, stock_quantity, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [name, finalDescription, parseInt(price_cents) * 100, category, specsJson, imagesJson, 0, 1], function(err) {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    res.json({
      success: true,
      message: 'Product created successfully',
      productId: this.lastID
    });
  });
});

// Update product (with file upload support)
app.put('/api/admin/products/:id', authenticateToken, upload.single('image'), (req, res) => {
  const { id } = req.params;
  const { name, description, price_cents, category, specs, stock_quantity, is_active } = req.body;

  // Parse specs if it's a string
  let specsArray = [];
  if (specs) {
    try {
      specsArray = typeof specs === 'string' ? JSON.parse(specs) : specs;
    } catch (e) {
      specsArray = [];
    }
  }

  // First, get current product to preserve existing images if no new image uploaded
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

    const specsJson = JSON.stringify(specsArray);

    db.run(`
      UPDATE products
      SET name = ?, description = ?, price_cents = ?, category = ?, specs = ?, images = ?,
          stock_quantity = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [name, description, price_cents, category, specsJson, imagesJson, stock_quantity || 0, is_active !== undefined ? is_active : 1, id], (err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      res.json({ success: true, message: 'Product updated successfully' });
    });
  });
});

// Delete product
app.delete('/api/admin/products/:id', authenticateToken, (req, res) => {
  const { id } = req.params;

  db.run('DELETE FROM products WHERE id = ?', [id], (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    res.json({ success: true, message: 'Product deleted successfully' });
  });
});

// Get orders
app.get('/api/admin/orders', authenticateToken, (req, res) => {
  db.all(`
    SELECT o.*, p.name as product_name
    FROM orders o
    LEFT JOIN products p ON o.product_id = p.id
    ORDER BY o.created_at DESC
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    res.json({ success: true, orders: rows });
  });
});

// Update order status
app.put('/api/admin/orders/:id/status', authenticateToken, (req, res) => {
  const { id } = req.params;
  const { status, tracking_number } = req.body;

  db.run(`
    UPDATE orders
    SET status = ?, tracking_number = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [status, tracking_number, id], (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    res.json({ success: true, message: 'Order updated successfully' });
  });
});

// Customer Management Routes
app.get('/api/admin/customers', authenticateToken, (req, res) => {
  db.all('SELECT * FROM customers ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, customers: rows });
  });
});

app.post('/api/admin/customers', authenticateToken, (req, res) => {
  const { name, email, phone, address, city, state } = req.body;
  
  db.run(`
    INSERT INTO customers (name, email, phone, address, city, state)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [name, email, phone, address, city, state], function(err) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error creating customer' });
    }
    res.json({ success: true, customerId: this.lastID });
  });
});

// Blog Management Routes
app.get('/api/admin/blog', authenticateToken, (req, res) => {
  db.all('SELECT * FROM blog_posts ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, posts: rows });
  });
});

app.post('/api/admin/blog', authenticateToken, (req, res) => {
  const { title, slug, content, excerpt, status, seo_title, seo_description } = req.body;
  
  db.run(`
    INSERT INTO blog_posts (title, slug, content, excerpt, status, seo_title, seo_description, author_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [title, slug, content, excerpt, status, seo_title, seo_description, req.user.id], function(err) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error creating blog post' });
    }
    res.json({ success: true, postId: this.lastID });
  });
});

// Website Content Management
app.get('/api/admin/content/:page', authenticateToken, (req, res) => {
  const { page } = req.params;
  
  db.all('SELECT * FROM website_content WHERE page = ?', [page], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, content: rows });
  });
});

app.put('/api/admin/content', authenticateToken, (req, res) => {
  const { page, section, content_key, content_value } = req.body;
  
  db.run(`
    INSERT OR REPLACE INTO website_content (page, section, content_key, content_value, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
  `, [page, section, content_key, content_value], (err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error updating content' });
    }
    res.json({ success: true, message: 'Content updated successfully' });
  });
});

// Image Gallery Management
app.get('/api/admin/gallery', authenticateToken, (req, res) => {
  db.all('SELECT * FROM gallery_images ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, images: rows });
  });
});

app.post('/api/admin/gallery', authenticateToken, upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No image uploaded' });
  }
  
  const { alt_text, category } = req.body;
  
  db.run(`
    INSERT INTO gallery_images (filename, original_name, file_path, file_size, mime_type, alt_text, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    req.file.filename,
    req.file.originalname,
    `/uploads/${req.file.filename}`,
    req.file.size,
    req.file.mimetype,
    alt_text,
    category || 'general'
  ], function(err) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error saving image' });
    }
    res.json({ success: true, imageId: this.lastID });
  });
});

// Enhanced Analytics with Charts Data
app.get('/api/admin/analytics/sales-trends', authenticateToken, (req, res) => {
  const { period = '30' } = req.query;
  
  db.all(`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as orders,
      SUM(total_amount_cents) as revenue
    FROM orders 
    WHERE created_at >= datetime('now', '-${period} days')
    AND status != 'cancelled'
    GROUP BY DATE(created_at)
    ORDER BY date
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, trends: rows });
  });
});

app.get('/api/admin/analytics/customer-analytics', authenticateToken, (req, res) => {
  db.all(`
    SELECT 
      c.name,
      c.email,
      c.total_orders,
      c.total_spent_cents,
      c.created_at
    FROM customers c
    ORDER BY c.total_spent_cents DESC
    LIMIT 10
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, topCustomers: rows });
  });
});

app.get('/api/admin/analytics/geographic-sales', authenticateToken, (req, res) => {
  db.all(`
    SELECT 
      c.state,
      COUNT(o.id) as orders,
      SUM(o.total_amount_cents) as revenue
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE o.status != 'cancelled' AND c.state IS NOT NULL
    GROUP BY c.state
    ORDER BY revenue DESC
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, geographic: rows });
  });
});

// Export Reports
app.get('/api/admin/export/orders', authenticateToken, (req, res) => {
  const { format = 'csv', date_from, date_to } = req.query;
  
  let query = 'SELECT * FROM orders WHERE 1=1';
  const params = [];
  
  if (date_from) {
    query += ' AND DATE(created_at) >= ?';
    params.push(date_from);
  }
  
  if (date_to) {
    query += ' AND DATE(created_at) <= ?';
    params.push(date_to);
  }
  
  query += ' ORDER BY created_at DESC';
  
  db.all(query, params, async (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    
    if (format === 'excel') {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Orders');
      
      worksheet.columns = [
        { header: 'Order ID', key: 'id', width: 10 },
        { header: 'Customer', key: 'customer_name', width: 20 },
        { header: 'Email', key: 'customer_email', width: 25 },
        { header: 'Amount', key: 'total_amount_cents', width: 15 },
        { header: 'Status', key: 'status', width: 15 },
        { header: 'Date', key: 'created_at', width: 20 }
      ];
      
      rows.forEach(row => {
        worksheet.addRow({
          ...row,
          total_amount_cents: row.total_amount_cents / 100
        });
      });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=orders.xlsx');
      
      await workbook.xlsx.write(res);
      res.end();
    } else {
      // CSV format
      const csv = [
        'Order ID,Customer,Email,Amount,Status,Date',
        ...rows.map(row => 
          `${row.id},"${row.customer_name}","${row.customer_email}",${row.total_amount_cents/100},${row.status},${row.created_at}`
        )
      ].join('\n');
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=orders.csv');
      res.send(csv);
    }
  });
});

// Invoice Generation
app.get('/api/admin/orders/:id/invoice', authenticateToken, (req, res) => {
  const { id } = req.params;
  
  db.get(`
    SELECT o.*, p.name as product_name, c.name as customer_name, c.email as customer_email, c.address
    FROM orders o
    LEFT JOIN products p ON o.product_id = p.id
    LEFT JOIN customers c ON o.customer_id = c.id
    WHERE o.id = ?
  `, [id], (err, order) => {
    if (err || !order) {
      return res.status(404).json({ success: false, message: 'Order not found' });
    }
    
    const doc = new PDFDocument();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice-${order.id}.pdf`);
    
    doc.pipe(res);
    
    // Invoice header
    doc.fontSize(20).text('FOLSME International Ltd', 50, 50);
    doc.fontSize(12).text('Invoice', 50, 80);
    doc.text(`Invoice #: ${order.invoice_number || order.id}`, 50, 100);
    doc.text(`Date: ${new Date(order.created_at).toLocaleDateString()}`, 50, 120);
    
    // Customer details
    doc.text('Bill To:', 50, 160);
    doc.text(order.customer_name, 50, 180);
    doc.text(order.customer_email, 50, 200);
    if (order.address) doc.text(order.address, 50, 220);
    
    // Order details
    doc.text('Description', 50, 280);
    doc.text('Quantity', 300, 280);
    doc.text('Amount', 450, 280);
    
    doc.text(order.product_name || 'Product', 50, 300);
    doc.text(order.quantity.toString(), 300, 300);
    doc.text(`₦${(order.total_amount_cents / 100).toLocaleString()}`, 450, 300);
    
    // Total
    doc.fontSize(14).text(`Total: ₦${(order.total_amount_cents / 100).toLocaleString()}`, 350, 350);
    
    doc.end();
  });
});

// Returns/Refunds Management
app.get('/api/admin/returns', authenticateToken, (req, res) => {
  db.all(`
    SELECT r.*, o.customer_name, o.total_amount_cents as order_amount
    FROM returns r
    LEFT JOIN orders o ON r.order_id = o.id
    ORDER BY r.created_at DESC
  `, [], (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    res.json({ success: true, returns: rows });
  });
});

app.post('/api/admin/returns', authenticateToken, (req, res) => {
  const { order_id, reason, refund_amount_cents } = req.body;
  
  db.run(`
    INSERT INTO returns (order_id, reason, refund_amount_cents)
    VALUES (?, ?, ?)
  `, [order_id, reason, refund_amount_cents], function(err) {
    if (err) {
      return res.status(500).json({ success: false, message: 'Error creating return' });
    }
    res.json({ success: true, returnId: this.lastID });
  });
});

// Sales analytics
app.get('/api/admin/sales/analytics', authenticateToken, (req, res) => {
  // Get total sales
  db.get(`
    SELECT
      COUNT(*) as total_orders,
      SUM(total_amount_cents) as total_revenue,
      AVG(total_amount_cents) as avg_order_value
    FROM orders
    WHERE status != 'cancelled'
  `, [], (err, stats) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    // Get sales by product
    db.all(`
      SELECT
        p.name,
        COUNT(o.id) as orders_count,
        SUM(o.total_amount_cents) as revenue
      FROM products p
      LEFT JOIN orders o ON p.id = o.product_id AND o.status != 'cancelled'
      GROUP BY p.id, p.name
      ORDER BY revenue DESC
    `, [], (err, productSales) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      res.json({
        success: true,
        analytics: {
          total_orders: stats.total_orders || 0,
          total_revenue: stats.total_revenue || 0,
          avg_order_value: stats.avg_order_value || 0,
          product_sales: productSales
        }
      });
    });
  });
});

// Sales trends analytics
app.get('/api/admin/analytics/sales-trends', authenticateToken, (req, res) => {
  const period = req.query.period || 30;
  
  db.all(`
    SELECT 
      DATE(created_at) as date,
      COUNT(*) as orders,
      SUM(total_amount_cents) as revenue
    FROM orders 
    WHERE created_at >= datetime('now', '-${period} days')
    AND status != 'cancelled'
    GROUP BY DATE(created_at)
    ORDER BY date DESC
  `, [], (err, trends) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    
    res.json({
      success: true,
      trends: trends || []
    });
  });
});

// Geographic sales analytics
app.get('/api/admin/analytics/geographic-sales', authenticateToken, (req, res) => {
  db.all(`
    SELECT 
      c.state,
      COUNT(o.id) as orders,
      SUM(o.total_amount_cents) as revenue
    FROM customers c
    LEFT JOIN orders o ON c.id = o.customer_id AND o.status != 'cancelled'
    WHERE c.state IS NOT NULL AND c.state != ''
    GROUP BY c.state
    ORDER BY revenue DESC
    LIMIT 10
  `, [], (err, geographic) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    
    res.json({
      success: true,
      geographic: geographic || []
    });
  });
});

// Customer analytics
app.get('/api/admin/analytics/customer-analytics', authenticateToken, (req, res) => {
  db.all(`
    SELECT 
      c.name,
      COUNT(o.id) as total_orders,
      SUM(o.total_amount_cents) as total_spent_cents
    FROM customers c
    LEFT JOIN orders o ON c.id = o.customer_id AND o.status != 'cancelled'
    GROUP BY c.id, c.name
    HAVING COUNT(o.id) > 0
    ORDER BY total_spent_cents DESC
    LIMIT 10
  `, [], (err, customers) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Database error' });
    }
    
    res.json({
      success: true,
      topCustomers: customers || []
    });
  });
});

// Serve admin pages
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

app.get('/admin', (req, res) => {
  res.redirect('/admin/login.html');
});

// Serve static files from root directory for public access
app.use(express.static(path.join(__dirname, '../../')));

// Specifically serve uploads folder for both admin and public access
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Start server
app.listen(PORT, () => {
  console.log(`Admin server running on port ${PORT}`);
  console.log(`Access admin at: http://localhost:${PORT}/admin`);
});

module.exports = app;