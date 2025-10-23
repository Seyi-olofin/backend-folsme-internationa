# 🏢 FOLSME Backend

Backend API and Admin Dashboard for FOLSME International - Mining & Generators E-commerce Platform.

## 🚀 Features

### Admin Dashboard
- 📊 **Order Management** - View, update, and track all customer orders
- 📈 **Analytics Dashboard** - Sales trends, revenue tracking, customer insights
- 🛍️ **Product Management** - Add, edit, and manage generators and minerals
- 👥 **Customer Management** - Customer data and order history
- 📝 **Blog Management** - Create and manage blog posts
- 🏆 **Achievements** - Company milestones and achievements

### API Endpoints
- 🛒 **E-commerce API** - Products, orders, checkout processing
- 💳 **Payment Integration** - Paystack live payment processing
- 🔐 **Authentication** - Secure admin login with JWT
- 📊 **Analytics API** - Sales data and business metrics
- ⛏️ **Mining API** - Mineral resources and pricing
- 🔋 **Generators API** - Generator products and specifications

## 🛠️ Technology Stack

- **Runtime**: Node.js
- **Framework**: Express.js
- **Database**: SQLite (production-ready)
- **Authentication**: JWT + bcrypt
- **Payment**: Paystack Integration
- **File Upload**: Multer
- **Security**: CORS, Sessions, Cookies

## 🚀 Deployment

### Railway (Recommended - $5/month)
1. Connect this repository to Railway
2. Add PostgreSQL database
3. Set environment variables
4. Deploy!

### Render ($7/month)
1. Connect this repository to Render
2. Set build command: `npm install`
3. Set start command: `npm start`
4. Add environment variables
5. Deploy!

### Heroku ($7/month)
1. Connect this repository to Heroku
2. Add Heroku Postgres addon
3. Set environment variables
4. Deploy!

## 🔧 Environment Variables

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=your_database_url
JWT_SECRET=your-secure-secret-key
CORS_ORIGINS=https://folsme.com,https://your-frontend-url.vercel.app
PAYSTACK_PUBLIC_KEY=pk_live_023425ed75a860add81737344db298746257afe5
PAYSTACK_SECRET_KEY=your_paystack_secret_key
```

## 📊 Database

- **SQLite** for development and small-scale production
- **PostgreSQL** for cloud deployment (Railway, Render, Heroku)
- **Automatic migration** on startup
- **Sample data** cleared for production

## 🔐 Security Features

- JWT authentication for admin access
- CORS protection
- Password hashing with bcrypt
- Session management
- File upload validation
- SQL injection protection

## 📈 Admin Dashboard Access

- **URL**: `https://your-backend-url.com`
- **Default Login**: admin / admin123
- **Features**: Full order and product management

## 🎯 API Status

- ✅ **Production Ready**
- ✅ **Payment Processing** (Paystack Live)
- ✅ **Database Optimized**
- ✅ **Security Hardened**
- ✅ **Scalable Architecture**

---

**FOLSME International Backend - Powering Nigeria's Industrial Growth** 🚀