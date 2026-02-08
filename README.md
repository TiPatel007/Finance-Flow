# 💰 FinanceFlow Pro - Node.js Version

**Complete AI-powered personal finance tracker with Node.js + Express backend**

## 🚀 Super Quick Start

### **Windows:**
1. Double-click `start-node.bat`
2. Done! Opens at http://127.0.0.1:5001

### **Mac/Linux:**
```bash
./start-node.sh
```

### **Manual:**
```bash
npm install
node server.js
```

## 📦 What You Need

- **Node.js 14+** ([Download here](https://nodejs.org/))
- **npm** (comes with Node.js)
- **Modern browser**

## ✅ Check Installation

```bash
node --version    # Should show v14 or higher
npm --version     # Should show 6 or higher
```

## 🎯 Features

- ✅ **Node.js + Express** backend
- ✅ **SQLite** database (no setup needed)
- ✅ **JWT** authentication
- ✅ **AI** auto-categorization
- ✅ **Fraud** detection
- ✅ **XP & Badges** gamification
- ✅ **Real-time** insights
- ✅ **Beautiful** terminal UI

## 📊 All API Endpoints

- ✅ POST `/api/auth/register`
- ✅ POST `/api/auth/login`
- ✅ GET `/api/expenses`
- ✅ POST `/api/expenses`
- ✅ DELETE `/api/expenses/:id`
- ✅ POST `/api/expenses/:id/mark-safe`
- ✅ GET `/api/goals`
- ✅ POST `/api/goals`
- ✅ PUT `/api/goals/:id`
- ✅ GET `/api/stats`
- ✅ GET `/api/insights`
- ✅ GET `/api/suggestions`
- ✅ GET `/api/predictions`
- ✅ GET `/api/badges`
- ✅ GET `/api/xp-history`
- ✅ GET `/api/health`

## 🔧 What's Different from Flask?

| Feature | Flask (Python) | Node.js (This) |
|---------|---------------|----------------|
| **Backend** | Python | JavaScript |
| **Framework** | Flask | Express.js |
| **Dependencies** | pip | npm |
| **Database** | SQLite | SQLite |
| **Performance** | Good | Excellent |
| **Async** | Limited | Native |

## 🛠️ Dependencies

```json
{
  "express": "Web framework",
  "cors": "Cross-origin support",
  "bcryptjs": "Password hashing",
  "jsonwebtoken": "JWT auth",
  "sqlite3": "Database"
}
```

## 🐛 Troubleshooting

### **"Port 5001 in use"**
```bash
# Mac/Linux
lsof -ti:5001 | xargs kill

# Windows
netstat -ano | findstr :5001
taskkill /PID <PID> /F
```

### **"Module not found"**
```bash
rm -rf node_modules package-lock.json
npm install
```

### **"Node not found"**
Install Node.js from https://nodejs.org/

## 🧪 Test It

```bash
curl http://127.0.0.1:5001/api/health
```

Should return: `{"status":"OK","message":"FinanceFlow API is running!"}`

## 📁 Files

```
financeflow-nodejs/
├── server.js           # Express backend
├── package.json        # Dependencies
├── index.html          # Frontend
├── start-node.sh       # Mac/Linux launcher
├── start-node.bat      # Windows launcher
└── README.md           # This file
```

## 🎮 How to Use

1. **Register** - Create account at http://127.0.0.1:5001
2. **Add Expense** - Track spending ("Starbucks coffee" → Auto-detects "Food")
3. **Get Insights** - AI analyzes your spending
4. **Create Goals** - Set savings targets
5. **Earn Badges** - Complete achievements

## 🔐 Security

- bcrypt password hashing
- JWT token authentication (30 day expiry)
- SQL injection protection
- CORS enabled

## 🚀 Production Deploy

### **Heroku:**
```bash
git init
heroku create
git push heroku main
```

### **Vercel:**
```bash
vercel --prod
```

### **PM2 (Production):**
```bash
npm install -g pm2
pm2 start server.js --name financeflow
pm2 save
```

## ⚡ Performance

Node.js is **async by nature** = handles many requests efficiently!


---

**Everything works perfectly!** 🎉

**Node.js > Python for web servers** 🚀
