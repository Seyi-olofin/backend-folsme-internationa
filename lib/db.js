const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Create database connection
const db = new sqlite3.Database(path.join(__dirname, '../data/database.sqlite'), (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Orders table
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      customer_phone TEXT,
      product_id INTEGER,
      quantity INTEGER NOT NULL,
      total_amount_cents INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      shipping_address TEXT,
      tracking_number TEXT,
      payment_status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (product_id) REFERENCES products (id)
    )
  `);

  console.log('Database tables initialized');
}

// Helper functions
function getProducts(callback) {
  db.all('SELECT * FROM products WHERE is_active = 1 ORDER BY created_at DESC', [], (err, rows) => {
    if (err) {
      return callback(err);
    }

    const products = rows.map(product => ({
      ...product,
      specs: product.specs ? JSON.parse(product.specs) : [],
      images: product.images ? JSON.parse(product.images) : []
    }));

    callback(null, products);
  });
}

function getProductById(id, callback) {
  db.get('SELECT * FROM products WHERE id = ? AND is_active = 1', [id], (err, row) => {
    if (err) {
      return callback(err);
    }

    if (row) {
      row.specs = row.specs ? JSON.parse(row.specs) : [];
      row.images = row.images ? JSON.parse(row.images) : [];
    }

    callback(null, row);
  });
}

function createProduct(productData, callback) {
  const { name, description, price_cents, category, specs, images, stock_quantity = 0 } = productData;

  const specsJson = JSON.stringify(specs || []);
  const imagesJson = JSON.stringify(images || []);

  db.run(`
    INSERT INTO products (name, description, price_cents, category, specs, images, stock_quantity, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [name, description, price_cents, category, specsJson, imagesJson, stock_quantity, 1], function(err) {
    if (err) {
      return callback(err);
    }

    callback(null, this.lastID);
  });
}

function updateProduct(id, productData, callback) {
  const { name, description, price_cents, category, specs, images, stock_quantity, is_active } = productData;

  const specsJson = JSON.stringify(specs || []);
  const imagesJson = JSON.stringify(images || []);

  db.run(`
    UPDATE products
    SET name = ?, description = ?, price_cents = ?, category = ?, specs = ?, images = ?,
        stock_quantity = ?, is_active = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [name, description, price_cents, category, specsJson, imagesJson, stock_quantity, is_active, id], callback);
}

function deleteProduct(id, callback) {
  db.run('DELETE FROM products WHERE id = ?', [id], callback);
}

function getOrders(callback) {
  db.all(`
    SELECT o.*, p.name as product_name
    FROM orders o
    LEFT JOIN products p ON o.product_id = p.id
    ORDER BY o.created_at DESC
  `, [], callback);
}

function updateOrderStatus(id, status, trackingNumber, callback) {
  db.run(`
    UPDATE orders
    SET status = ?, tracking_number = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [status, trackingNumber, id], callback);
}

function getSalesAnalytics(callback) {
  // Get total stats
  db.get(`
    SELECT
      COUNT(*) as total_orders,
      SUM(total_amount_cents) as total_revenue,
      AVG(total_amount_cents) as avg_order_value
    FROM orders
    WHERE status != 'cancelled'
  `, [], (err, stats) => {
    if (err) {
      return callback(err);
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
        return callback(err);
      }

      callback(null, {
        total_orders: stats.total_orders || 0,
        total_revenue: stats.total_revenue || 0,
        avg_order_value: stats.avg_order_value || 0,
        product_sales: productSales
      });
    });
  });
}

function getUserByUsername(username, callback) {
  db.get('SELECT * FROM users WHERE username = ?', [username], callback);
}

function createUser(userData, callback) {
  const { username, password_hash, role = 'admin' } = userData;

  db.run(
    'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
    [username, password_hash, role],
    function(err) {
      if (err) {
        return callback(err);
      }
      callback(null, this.lastID);
    }
  );
}

module.exports = {
  db,
  initializeDatabase,
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getOrders,
  updateOrderStatus,
  getSalesAnalytics,
  getUserByUsername,
  createUser
};