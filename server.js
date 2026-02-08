const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Database setup
const db = new sqlite3.Database('./financeflow.db', (err) => {
  if (err) {
    console.error('Database connection error:', err);
  } else {
    console.log('✅ Connected to SQLite database');
    initDatabase();
  }
});

// Initialize database tables
function initDatabase() {
  db.serialize(() => {
    // Users table
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        monthly_budget REAL DEFAULT 3000.00,
        xp_points INTEGER DEFAULT 0,
        streak_days INTEGER DEFAULT 0,
        last_expense_date TEXT,
        journey_stage TEXT DEFAULT 'beginner',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Expenses table
    db.run(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL,
        category TEXT NOT NULL,
        date TEXT NOT NULL,
        notes TEXT,
        is_fraud INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Goals table
    db.run(`
      CREATE TABLE IF NOT EXISTS goals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        target_amount REAL NOT NULL,
        current_amount REAL DEFAULT 0.00,
        target_date TEXT,
        completed INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // User badges table
    db.run(`
      CREATE TABLE IF NOT EXISTS user_badges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        badge_name TEXT NOT NULL,
        earned_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, badge_name)
      )
    `);

    // XP history table
    db.run(`
      CREATE TABLE IF NOT EXISTS xp_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        action TEXT NOT NULL,
        xp_gained INTEGER NOT NULL,
        description TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log('✅ Database tables initialized');
  });
}

// Add investor_type column if it doesn't exist (safe for upgrades)
db.serialize(() => {
  db.run("ALTER TABLE users ADD COLUMN investor_type TEXT DEFAULT NULL", (err) => {
    // If column already exists, SQLite will error; ignore that error
    if (err && !/duplicate column name|already exists/i.test(err.message)) {
      console.warn('Could not add investor_type column:', err.message);
    }
  });
});

// Add invest_settings column if it doesn't exist (stores JSON string)
db.serialize(() => {
  db.run("ALTER TABLE users ADD COLUMN invest_settings TEXT DEFAULT NULL", (err) => {
    if (err && !/duplicate column name|already exists/i.test(err.message)) {
      console.warn('Could not add invest_settings column:', err.message);
    }
  });
});

// AI Logic
const FinanceAI = {
  autoDetectCategory(description) {
    const desc = description.toLowerCase();
    
    const patterns = {
      'Food': ['starbucks', 'coffee', 'pizza', 'restaurant', 'mcdonald', 'burger', 
               'lunch', 'dinner', 'breakfast', 'grocery', 'food', 'eat', 'chipotle'],
      'Transport': ['uber', 'lyft', 'gas', 'fuel', 'parking', 'bus', 'train', 
                   'metro', 'taxi', 'car'],
      'Entertainment': ['movie', 'cinema', 'netflix', 'spotify', 'game', 'concert', 
                       'bar', 'club', 'party'],
      'Shopping': ['amazon', 'target', 'walmart', 'clothes', 'shoes', 'mall', 
                  'store', 'shop', 'watch'],
      'Bills': ['rent', 'electricity', 'water', 'internet', 'phone', 'insurance', 
               'utility'],
      'Education': ['book', 'tuition', 'course', 'class', 'school', 'university', 
                   'textbook', 'supplies']
    };
    
    for (const [category, keywords] of Object.entries(patterns)) {
      if (keywords.some(keyword => desc.includes(keyword))) {
        return category;
      }
    }
    
    return 'Other';
  },

  detectFraud(expenses, newAmount) {
    if (!expenses || expenses.length < 3) {
      return newAmount > 1000;
    }
    
    const amounts = expenses.map(exp => parseFloat(exp.amount));
    const mean = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const variance = amounts.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / amounts.length;
    const stdev = Math.sqrt(variance);
    
    if (newAmount > mean + (3 * stdev)) {
      return true;
    }
    
    if (newAmount > 1000) {
      return true;
    }
    
    return false;
  },

  calculateXp(action) {
    const xpRewards = {
      'add_expense': 5,
      'create_goal': 20,
      'complete_goal': 100,
      'maintain_streak': 10,
      'under_budget': 50,
      'mark_safe': 5
    };
    return xpRewards[action] || 0;
  },

  checkBadges(user, expensesCount, goalsCount, completedGoals) {
    const badges = [];
    
    if (expensesCount >= 5) badges.push('First Steps');
    if (expensesCount >= 50) badges.push('Budget Tracker');
    if (user.streak_days >= 7) badges.push('Week Warrior');
    if (user.streak_days >= 30) badges.push('Month Master');
    if (completedGoals >= 1) badges.push('Goal Getter');
    if (user.xp_points >= 500) badges.push('Finance Pro');
    if (user.xp_points >= 100) badges.push('Budget Starter');
    if (expensesCount >= 100) badges.push('Trend Master');
    
    return badges;
  },

  analyzeSpending(expenses, monthlyBudget) {
    const insights = [];
    
    if (!expenses || expenses.length === 0) {
      insights.push({
        type: 'info',
        title: '🌱 Just Getting Started',
        message: 'Start tracking your expenses to get personalized insights!'
      });
      return insights;
    }
    
    const totalSpent = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
    const percentUsed = (totalSpent / monthlyBudget * 100);
    
    if (percentUsed > 100) {
      insights.push({
        type: 'warning',
        title: '⚠️ Over Budget',
        message: `You've spent ${percentUsed.toFixed(1)}% of your budget. Consider reducing expenses.`
      });
    } else if (percentUsed > 80) {
      insights.push({
        type: 'warning',
        title: '⚠️ Budget Alert',
        message: `You've used ${percentUsed.toFixed(1)}% of your budget. Watch your spending!`
      });
    } else {
      const remaining = monthlyBudget - totalSpent;
      insights.push({
        type: 'success',
        title: '✅ On Track',
        message: `Great job! You have $${remaining.toFixed(2)} remaining (${(100-percentUsed).toFixed(1)}% of budget).`
      });
    }
    
    // Category analysis
    const categoryTotals = {};
    expenses.forEach(exp => {
      categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + parseFloat(exp.amount);
    });
    
    if (Object.keys(categoryTotals).length > 0) {
      const topCategory = Object.entries(categoryTotals).reduce((a, b) => a[1] > b[1] ? a : b);
      const percent = (topCategory[1] / totalSpent * 100).toFixed(0);
      insights.push({
        type: 'info',
        title: '📊 Top Spending Category',
        message: `${topCategory[0]} accounts for ${percent}% ($${topCategory[1].toFixed(2)}) of your spending.`
      });
    }
    
    // Fraud check
    const fraudCount = expenses.filter(exp => exp.is_fraud).length;
    if (fraudCount > 0) {
      insights.push({
        type: 'warning',
        title: '🚨 Suspicious Activity',
        message: `Found ${fraudCount} potentially fraudulent transaction(s). Please review them.`
      });
    }
    
    return insights;
  },

  generateSavingsSuggestions(expenses, monthlyBudget) {
    const suggestions = [];
    
    if (!expenses || expenses.length === 0) {
      return suggestions;
    }
    
    const categoryTotals = {};
    expenses.forEach(exp => {
      categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + parseFloat(exp.amount);
    });
    
    const avgSpending = {
      'Food': 300,
      'Transport': 150,
      'Entertainment': 100,
      'Shopping': 200,
      'Bills': 400,
      'Education': 500
    };
    
    for (const [category, spent] of Object.entries(categoryTotals)) {
      const avg = avgSpending[category] || 100;
      if (spent > avg * 1.2) {
        const savings = spent - avg;
        suggestions.push({
          category,
          current: spent,
          average: avg,
          monthly_savings: savings,
          yearly_savings: savings * 12,
          tip: this.getCategoryTip(category, savings)
        });
      }
    }
    
    return suggestions.sort((a, b) => b.monthly_savings - a.monthly_savings).slice(0, 3);
  },

  getCategoryTip(category, amount) {
    const tips = {
      'Food': `Try meal prepping on Sundays. Save $${amount.toFixed(2)}/month by cooking at home.`,
      'Transport': `Consider a monthly bus pass or carpooling. Save $${amount.toFixed(2)}/month.`,
      'Entertainment': `Look for student discounts and free events. Save $${amount.toFixed(2)}/month.`,
      'Shopping': `Use the 24-hour rule before purchases. Save $${amount.toFixed(2)}/month.`,
      'Bills': `Review subscriptions you don't use. Save $${amount.toFixed(2)}/month.`,
      'Education': `Check for used textbooks or digital versions. Save $${amount.toFixed(2)}/semester.`
    };
    return tips[category] || `Reduce spending in this category to save $${amount.toFixed(2)}/month.`;
  }
};

// Auth middleware
const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization;
  
  if (!token) {
    return res.status(401).json({ error: 'Token is missing' });
  }
  
  try {
    const tokenValue = token.startsWith('Bearer ') ? token.slice(7) : token;
    const decoded = jwt.verify(tokenValue, JWT_SECRET);
    req.userId = decoded.user_id;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// ============= AUTHENTICATION ROUTES =============

app.post('/api/auth/register', async (req, res) => {
  const { email, password, name, monthlyBudget = 3000 } = req.body;
  
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Check if user exists
  db.get('SELECT id FROM users WHERE email = ?', [email], async (err, row) => {
    if (row) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);
    
    // Create user
    db.run(
      'INSERT INTO users (email, password_hash, name, monthly_budget, investor_type) VALUES (?, ?, ?, ?, ?)',
      [email, passwordHash, name, monthlyBudget, null],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Registration failed' });
        }
        
        const userId = this.lastID;
        
        // Create default goal
        db.run(
          'INSERT INTO goals (user_id, name, target_amount, target_date) VALUES (?, ?, ?, ?)',
          [userId, 'Emergency Fund', 1000, new Date(Date.now() + 90*24*60*60*1000).toISOString().split('T')[0]]
        );
        
        // Generate JWT
        const token = jwt.sign({ user_id: userId }, JWT_SECRET, { expiresIn: '30d' });
        
        res.status(201).json({
          message: 'User registered successfully',
          token,
          user: { id: userId, email, name }
        });
      }
    );
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  
  if (!email || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }
  
  db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const token = jwt.sign({ user_id: user.id }, JWT_SECRET, { expiresIn: '30d' });
    
    // Parse invest_settings if present
    let investSettings = null;
    try {
      investSettings = user.invest_settings ? JSON.parse(user.invest_settings) : null;
    } catch (e) {
      investSettings = null;
    }

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        monthlyBudget: user.monthly_budget,
        xpPoints: user.xp_points,
        streakDays: user.streak_days,
        investorType: user.investor_type || null,
        investSettings
      }
    });
  });
});

// ============= EXPENSE ROUTES =============

app.get('/api/expenses', authMiddleware, (req, res) => {
  db.all('SELECT * FROM expenses WHERE user_id = ? ORDER BY date DESC', [req.userId], (err, expenses) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch expenses' });
    }
    res.json(expenses);
  });
});

app.post('/api/expenses', authMiddleware, (req, res) => {
  const { name, amount, category = 'auto', date = new Date().toISOString().split('T')[0], notes = '' } = req.body;
  
  if (!name || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Auto-detect category
  const finalCategory = category === 'auto' ? FinanceAI.autoDetectCategory(name) : category;
  
  // Get existing expenses for fraud detection
  db.all('SELECT amount FROM expenses WHERE user_id = ?', [req.userId], (err, expenses) => {
    const isFraud = FinanceAI.detectFraud(expenses, parseFloat(amount));
    
    // Insert expense
    db.run(
      'INSERT INTO expenses (user_id, name, amount, category, date, notes, is_fraud) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [req.userId, name, amount, finalCategory, date, notes, isFraud ? 1 : 0],
      function(err) {
        if (err) {
          return res.status(500).json({ error: 'Failed to add expense' });
        }
        
        const expenseId = this.lastID;
        
        // Update streak
        db.get('SELECT last_expense_date, streak_days FROM users WHERE id = ?', [req.userId], (err, user) => {
          const today = new Date().toISOString().split('T')[0];
          let newStreak = 1;
          
          if (user && user.last_expense_date) {
            const lastDate = new Date(user.last_expense_date);
            const todayDate = new Date(today);
            const diffDays = Math.floor((todayDate - lastDate) / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
              newStreak = user.streak_days + 1;
            } else if (diffDays === 0) {
              newStreak = user.streak_days;
            }
          }
          
          // Add XP
          const xpGained = FinanceAI.calculateXp('add_expense');
          
          db.run(
            'UPDATE users SET xp_points = xp_points + ?, streak_days = ?, last_expense_date = ? WHERE id = ?',
            [xpGained, newStreak, today, req.userId]
          );
          
          // Log XP
          db.run(
            'INSERT INTO xp_history (user_id, action, xp_gained, description) VALUES (?, ?, ?, ?)',
            [req.userId, 'add_expense', xpGained, `Added expense: ${name}`]
          );
          
          res.status(201).json({
            message: 'Expense added successfully',
            id: expenseId,
            category: finalCategory,
            xpGained,
            newStreak,
            isFraud
          });
        });
      }
    );
  });
});

app.delete('/api/expenses/:id', authMiddleware, (req, res) => {
  db.run('DELETE FROM expenses WHERE id = ? AND user_id = ?', [req.params.id, req.userId], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to delete expense' });
    }
    res.json({ message: 'Expense deleted successfully' });
  });
});

app.post('/api/expenses/:id/mark-safe', authMiddleware, (req, res) => {
  db.run('UPDATE expenses SET is_fraud = 0 WHERE id = ? AND user_id = ?', [req.params.id, req.userId], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to mark expense as safe' });
    }
    
    const xpGained = FinanceAI.calculateXp('mark_safe');
    db.run('UPDATE users SET xp_points = xp_points + ? WHERE id = ?', [xpGained, req.userId]);
    
    res.json({ message: 'Expense marked as safe', xpGained });
  });
});

// ============= GOAL ROUTES =============
app.get('/api/goals', authMiddleware, (req, res) => {
  db.all('SELECT * FROM goals WHERE user_id = ? ORDER BY created_at DESC', [req.userId], (err, goals) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch goals' });
    res.json(goals);
  });
});

app.post('/api/goals', authMiddleware, (req, res) => {
  const { name, targetAmount, targetDate } = req.body;
  if (!name || !targetAmount) return res.status(400).json({ error: 'Missing required fields' });

  db.run(
    'INSERT INTO goals (user_id, name, target_amount, target_date) VALUES (?, ?, ?, ?)',
    [req.userId, name, targetAmount, targetDate],
    function(err) {
      if (err) return res.status(500).json({ error: 'Failed to create goal' });

      const xpGained = FinanceAI.calculateXp('create_goal');
      db.run('UPDATE users SET xp_points = xp_points + ? WHERE id = ?', [xpGained, req.userId]);
      db.run(
        'INSERT INTO xp_history (user_id, action, xp_gained, description) VALUES (?, ?, ?, ?)',
        [req.userId, 'create_goal', xpGained, `Created goal: ${name}`]
      );

      res.status(201).json({ message: 'Goal created successfully', id: this.lastID, xpGained });
    }
  );
});

app.put('/api/goals/:id', authMiddleware, (req, res) => {
  const { currentAmount } = req.body;

  db.get('SELECT target_amount, completed FROM goals WHERE id = ? AND user_id = ?', [req.params.id, req.userId], (err, goal) => {
    if (!goal) return res.status(404).json({ error: 'Goal not found' });

    const completed = currentAmount >= goal.target_amount;
    db.run('UPDATE goals SET current_amount = ?, completed = ? WHERE id = ?', [currentAmount, completed ? 1 : 0, req.params.id], (err) => {
      if (err) return res.status(500).json({ error: 'Failed to update goal' });

      if (completed && !goal.completed) {
        const xpGained = FinanceAI.calculateXp('complete_goal');
        db.run('UPDATE users SET xp_points = xp_points + ? WHERE id = ?', [xpGained, req.userId]);
        db.run('INSERT OR IGNORE INTO user_badges (user_id, badge_name) VALUES (?, ?)', [req.userId, 'Goal Getter']);
      }

      res.json({ message: 'Goal updated successfully', completed });
    });
  });
});

// ============= STATS & INSIGHTS ROUTES =============

app.get('/api/stats', authMiddleware, (req, res) => {
  db.get('SELECT * FROM users WHERE id = ?', [req.userId], (err, user) => {
    db.all('SELECT * FROM expenses WHERE user_id = ?', [req.userId], (err, expenses) => {
      db.all('SELECT * FROM goals WHERE user_id = ?', [req.userId], (err, goals) => {
        db.all('SELECT badge_name FROM user_badges WHERE user_id = ?', [req.userId], (err, badges) => {
          
          const totalSpent = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
          
          const categoryTotals = {};
          expenses.forEach(exp => {
            categoryTotals[exp.category] = (categoryTotals[exp.category] || 0) + parseFloat(exp.amount);
          });
          
          const completedGoals = goals.filter(g => g.completed).length;
          const earnedBadges = FinanceAI.checkBadges(user, expenses.length, goals.length, completedGoals);
          
          earnedBadges.forEach(badge => {
            db.run('INSERT OR IGNORE INTO user_badges (user_id, badge_name) VALUES (?, ?)', [req.userId, badge]);
          });
          
          res.json({
            monthlyBudget: user.monthly_budget,
            totalSpent,
            remaining: user.monthly_budget - totalSpent,
            xpPoints: user.xp_points,
            streakDays: user.streak_days,
            categoryTotals,
            badges: badges.map(b => b.badge_name),
            totalExpenses: expenses.length,
            totalGoals: goals.length,
            completedGoals
          });
        });
      });
    });
  });
});

app.get('/api/insights', authMiddleware, (req, res) => {
  db.get('SELECT monthly_budget FROM users WHERE id = ?', [req.userId], (err, user) => {
    db.all('SELECT * FROM expenses WHERE user_id = ?', [req.userId], (err, expenses) => {
      const insights = FinanceAI.analyzeSpending(expenses, user.monthly_budget);
      res.json(insights);
    });
  });
});

app.get('/api/suggestions', authMiddleware, (req, res) => {
  db.get('SELECT monthly_budget FROM users WHERE id = ?', [req.userId], (err, user) => {
    db.all('SELECT * FROM expenses WHERE user_id = ?', [req.userId], (err, expenses) => {
      const suggestions = FinanceAI.generateSavingsSuggestions(expenses, user.monthly_budget);
      res.json(suggestions);
    });
  });
});

app.get('/api/predictions', authMiddleware, (req, res) => {
  db.get('SELECT monthly_budget FROM users WHERE id = ?', [req.userId], (err, user) => {
    db.all('SELECT amount FROM expenses WHERE user_id = ?', [req.userId], (err, expenses) => {
      const totalSpent = expenses.reduce((sum, exp) => sum + parseFloat(exp.amount), 0);
      const savingsPerMonth = user.monthly_budget - totalSpent;
      
      res.json({
        oneMonth: Math.round(savingsPerMonth),
        threeMonths: Math.round(savingsPerMonth * 3),
        sixMonths: Math.round(savingsPerMonth * 6),
        oneYear: Math.round(savingsPerMonth * 12),
        recommendation: `Based on your current spending, you can save $${savingsPerMonth.toFixed(2)} per month.`
      });
    });
  });
});

app.get('/api/badges', authMiddleware, (req, res) => {
  db.all('SELECT badge_name, earned_at FROM user_badges WHERE user_id = ?', [req.userId], (err, badges) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch badges' });
    }
    res.json(badges);
  });
});

app.get('/api/xp-history', authMiddleware, (req, res) => {
  db.all('SELECT * FROM xp_history WHERE user_id = ? ORDER BY created_at DESC LIMIT 20', [req.userId], (err, history) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to fetch XP history' });
    }
    res.json(history);
  });
});

// ============= ADDITIONAL ROUTES =============

app.put('/api/budget', authMiddleware, (req, res) => {
  const { monthlyBudget } = req.body;
  
  if (!monthlyBudget || monthlyBudget <= 0) {
    return res.status(400).json({ error: 'Invalid budget amount' });
  }
  
  db.run('UPDATE users SET monthly_budget = ? WHERE id = ?', [monthlyBudget, req.userId], (err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to update budget' });
    }
    res.json({ message: 'Budget updated successfully', monthlyBudget });
  });
});

app.get('/api/profile', authMiddleware, (req, res) => {
  db.get('SELECT id, email, name, monthly_budget, xp_points, streak_days, journey_stage, investor_type FROM users WHERE id = ?', [req.userId], (err, user) => {
    if (err || !user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  });
});

// Persist investor type per user (educational preference)
app.put('/api/investor-type', authMiddleware, (req, res) => {
  const { investorType } = req.body;
  db.run('UPDATE users SET investor_type = ? WHERE id = ?', [investorType, req.userId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Failed to update investor type' });
    }
    res.json({ message: 'Investor type updated', investorType });
  });
});

// Get invest settings for the authenticated user
app.get('/api/invest-settings', authMiddleware, (req, res) => {
  db.get('SELECT invest_settings FROM users WHERE id = ?', [req.userId], (err, row) => {
    if (err) return res.status(500).json({ error: 'Failed to fetch invest settings' });
    let settings = null;
    if (row && row.invest_settings) {
      try { settings = JSON.parse(row.invest_settings); } catch (e) { settings = null; }
    }
    res.json({ investSettings: settings });
  });
});

// Save invest settings for the authenticated user
app.put('/api/invest-settings', authMiddleware, (req, res) => {
  const settings = req.body || null;
  let settingsStr = null;
  try { settingsStr = settings ? JSON.stringify(settings) : null; } catch (e) { settingsStr = null; }

  db.run('UPDATE users SET invest_settings = ? WHERE id = ?', [settingsStr, req.userId], function(err) {
    if (err) return res.status(500).json({ error: 'Failed to save invest settings' });
    res.json({ message: 'Invest settings saved', investSettings: settings });
  });
});

// ============= HEALTH CHECK =============

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'FinanceFlow API is running!' });
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Error handlers
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║   💰 FinanceFlow Node.js API Server       ║
║   ✅ Running on port ${PORT}                  ║
║   ✅ Database initialized                  ║
║   🚀 Ready for requests!                   ║
╚════════════════════════════════════════════╝

Server: http://localhost:${PORT}
Health: http://localhost:${PORT}/api/health
  `);
});

module.exports = app;
