import React, { useState, useEffect, createContext, useContext, useRef, useMemo } from 'react';
import { 
  CheckCircle, 
  Circle, 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  RotateCcw, 
  Award, 
  TrendingUp, 
  Target, 
  LogOut, 
  Moon, 
  Sun,
  X,
  Database,
  Sparkles, // Đã thêm icon AI
  Loader2,  // Đã thêm icon loading
  Timer // Đã thêm icon Đồng hồ
} from 'lucide-react';

// --- TƯƠNG ĐƯƠNG VỚI `utils.py` VÀ CÁC HÀM TIỆN ÍCH ---

// Hàm kiểm tra xem một ngày có phải là hôm nay không
const isToday = (someDate) => {
  if (!someDate) return false;
  const today = new Date();
  const date = new Date(someDate);
  return date.getDate() === today.getDate() &&
         date.getMonth() === today.getMonth() &&
         date.getFullYear() === today.getFullYear();
};

// Hàm lấy ngày hôm qua
const getYesterday = () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday;
};

// --- CÁC HÀM GỌI API GEMINI ---

/**
 * Gọi API Gemini với một prompt văn bản đơn giản.
 * @param {string} prompt - Câu lệnh prompt cho AI.
 * @returns {Promise<string>} - Văn bản trả về từ AI.
 */
const callGeminiApi = async (prompt) => {
  const apiKey = ""; // API key được Canvas tự động cung cấp
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: {
      parts: [{ text: "Bạn là một trợ lý năng suất. Hãy trả lời ngắn gọn, súc tích, tập trung vào yêu cầu." }]
    }
  };

  // Logic thử lại (retry) với exponential backoff
  let response;
  let retries = 3;
  let delayMs = 1000;
  while (retries > 0) {
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) break; // Thành công
      if (response.status === 429) { // Quá tải
        console.warn("Gemini API rate limit exceeded. Retrying...");
      }
    } catch (error) {
      // Lỗi mạng
      console.error("Network error calling Gemini:", error);
    }
    retries--;
    if (retries > 0) {
      await new Promise(res => setTimeout(res, delayMs));
      delayMs *= 2; // Tăng gấp đôi thời gian chờ
    }
  }

  if (!response || !response.ok) {
    console.error('Gemini API call failed after retries.');
    throw new Error('Gemini API call failed after retries.');
  }

  const result = await response.json();
  const candidate = result.candidates?.[0];
  if (candidate && candidate.content?.parts?.[0]?.text) {
    return candidate.content.parts[0].text;
  } else {
    console.error('Invalid response structure from Gemini API:', result);
    throw new Error('Invalid response structure from Gemini API.');
  }
};

/**
 * Gọi API Gemini và yêu cầu trả về dữ liệu dạng JSON.
 * @param {string} prompt - Câu lệnh prompt cho AI.
 * @returns {Promise<Array<object>>} - Một mảng các đối tượng task.
 */
const callGeminiApiWithJson = async (prompt) => {
  const apiKey = ""; // API key được Canvas tự động cung cấp
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: {
      parts: [{ text: "Bạn là một trợ lý năng suất. Hãy trả lời chính xác theo cấu trúc JSON được yêu cầu." }]
    },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            "taskName": { "type": "STRING", "description": "Tên của công việc cần làm" }
          },
          required: ["taskName"]
        }
      }
    }
  };
  
  // Logic thử lại (retry)
  let response;
  let retries = 3;
  let delayMs = 1000;
  while (retries > 0) {
    try {
      response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (response.ok) break;
    } catch (error) {
      console.error("Network error calling Gemini (JSON):", error);
    }
    retries--;
    if (retries > 0) {
      await new Promise(res => setTimeout(res, delayMs));
      delayMs *= 2;
    }
  }

  if (!response || !response.ok) {
    console.error('Gemini API (JSON) call failed after retries.');
    throw new Error('Gemini API (JSON) call failed after retries.');
  }

  const result = await response.json();
  const candidate = result.candidates?.[0];
  if (candidate && candidate.content?.parts?.[0]?.text) {
    try {
      // API trả về một chuỗi JSON, cần parse nó
      return JSON.parse(candidate.content.parts[0].text);
    } catch (e) {
      console.error('Failed to parse JSON response from Gemini:', e);
      throw new Error('Failed to parse JSON response from Gemini.');
    }
  } else {
    console.error('Invalid response structure from Gemini API (JSON):', result);
    throw new Error('Invalid response structure from Gemini API (JSON).');
  }
};


// --- MÔ PHỎNG BACKEND (localStorage) ---
// Đổi tên 'mockApi' thành 'dbApi' để rõ ràng hơn
const dbApi = {
  // Mô phỏng độ trễ của mạng
  delay: (ms = 500) => new Promise(res => setTimeout(res, ms)),

  // --- User Auth (Tương đương routes/auth.py) ---
  
  signup: async (username, password) => {
    await dbApi.delay(300);
    const users = JSON.parse(localStorage.getItem('hub_users') || '[]');
    const existingUser = users.find(u => u.username === username);
    if (existingUser) {
      throw new Error('Tên người dùng đã tồn tại');
    }
    const newUser = { id: Date.now().toString(), username };
    // Không lưu password trong localStorage ở thực tế, đây chỉ là demo
    users.push(newUser);
    localStorage.setItem('hub_users', JSON.stringify(users));
    
    // Tạo dữ liệu mặc định cho user mới
    localStorage.setItem(`hub_stats_${newUser.id}`, JSON.stringify({
      points: 100,
      streak: 0,
      totalPomodoros: 0,
      lastLogin: new Date().toISOString()
    }));
    localStorage.setItem(`hub_tasks_${newUser.id}`, '[]');
    localStorage.setItem(`hub_commitment_${newUser.id}`, JSON.stringify({
      wager: 0,
      streak: 0
    }));
    return dbApi.login(username, password);
  },

  login: async (username, password) => {
    await dbApi.delay(300);
    const users = JSON.parse(localStorage.getItem('hub_users') || '[]');
    const user = users.find(u => u.username === username);
    // Bỏ qua kiểm tra password cho demo
    if (user) {
      const token = `mock-jwt-token-for-${user.id}`;
      localStorage.setItem('hub_token', token);
      return { token, user };
    }
    throw new Error('Tên người dùng hoặc mật khẩu không đúng');
  },

  logout: () => {
    localStorage.removeItem('hub_token');
  },

  getUserFromToken: async (token) => {
    await dbApi.delay(100);
    if (!token || !token.startsWith('mock-jwt-token-for-')) {
      return null;
    }
    const userId = token.split('-').pop();
    const users = JSON.parse(localStorage.getItem('hub_users') || '[]');
    const user = users.find(u => u.id === userId);
    return user || null;
  },

  // --- Task Management (Tương đương routes/task.py) ---

  getTasks: async (userId) => {
    await dbApi.delay(200);
    const tasks = JSON.parse(localStorage.getItem(`hub_tasks_${userId}`) || '[]');
    // Chỉ trả về các task của ngày hôm nay
    return tasks.filter(task => isToday(task.createdAt));
  },

  addTask: async (userId, text, deadline) => {
    await dbApi.delay(100);
    const allTasks = JSON.parse(localStorage.getItem(`hub_tasks_${userId}`) || '[]');
    const newTask = {
      id: Date.now().toString(),
      text,
      completed: false,
      createdAt: new Date().toISOString(),
      deadline: deadline ? new Date(deadline).toISOString() : null
    };
    // Chỉ lưu các task trong 3 ngày để tránh localStorage bị đầy
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const recentTasks = allTasks.filter(task => new Date(task.createdAt) > threeDaysAgo);
    
    recentTasks.push(newTask);
    localStorage.setItem(`hub_tasks_${userId}`, JSON.stringify(recentTasks));
    return newTask;
  },

  updateTask: async (userId, taskId, updates) => {
    await dbApi.delay(50);
    const allTasks = JSON.parse(localStorage.getItem(`hub_tasks_${userId}`) || '[]');
    let updatedTask = null;
    const newTasks = allTasks.map(task => {
      if (task.id === taskId) {
        updatedTask = { ...task, ...updates };
        return updatedTask;
      }
      return task;
    });
    localStorage.setItem(`hub_tasks_${userId}`, JSON.stringify(newTasks));
    return updatedTask;
  },

  deleteTask: async (userId, taskId) => {
    await dbApi.delay(50);
    const allTasks = JSON.parse(localStorage.getItem(`hub_tasks_${userId}`) || '[]');
    const newTasks = allTasks.filter(task => task.id !== taskId);
    localStorage.setItem(`hub_tasks_${userId}`, JSON.stringify(newTasks));
    return { success: true };
  },

  // --- Stats & Pomodoro (Tương đương routes/pomodoro.py & logic) ---

  getStats: async (userId) => {
    await dbApi.delay(100);
    const stats = JSON.parse(localStorage.getItem(`hub_stats_${userId}`) || '{}');
    return {
      points: 100,
      streak: 0,
      totalPomodoros: 0,
      lastLogin: null,
      ...stats
    };
  },
  
  updateStats: async (userId, newStats) => {
    await dbApi.delay(50);
    localStorage.setItem(`hub_stats_${userId}`, JSON.stringify(newStats));
    return newStats;
  },

  logPomodoroSession: async (userId) => {
    await dbApi.delay(100);
    const stats = await dbApi.getStats(userId);
    const newStats = { ...stats, totalPomodoros: (stats.totalPomodoros || 0) + 1 };
    return dbApi.updateStats(userId, newStats);
  },

  // --- Commitment Fund (Tương đương routes/commitment.py) ---

  getCommitment: async (userId) => {
    await dbApi.delay(100);
    const commitment = JSON.parse(localStorage.getItem(`hub_commitment_${userId}`) || '{}');
    return {
      wager: 0,
      streak: 0,
      taskIds: [], // THÊM MỚI: Mảng các ID task đã cam kết
      ...commitment
    };
  },

  updateCommitment: async (userId, newCommitment) => {
    await dbApi.delay(100);
    localStorage.setItem(`hub_commitment_${userId}`, JSON.stringify(newCommitment));
    return newCommitment;
  },
  
  // --- Logic "Cron Job" mô phỏng ---
  // Logic này chạy khi user đăng nhập, kiểm tra xem có phải ngày mới không
  runDailyCheck: async (userId) => {
    console.log("Running daily check...");
    const stats = await dbApi.getStats(userId);
    const today = new Date();

    if (!isToday(stats.lastLogin)) {
      console.log("New day detected! Processing yesterday's results.");
      // --- Xử lý logic của ngày hôm qua ---
      const yesterday = getYesterday();
      const allTasks = JSON.parse(localStorage.getItem(`hub_tasks_${userId}`) || '[]');
      
      // Lọc task của ngày hôm qua
      const yesterdayTasks = allTasks.filter(task => {
          const taskDate = new Date(task.createdAt);
          return taskDate.getDate() === yesterday.getDate() &&
                 taskDate.getMonth() === yesterday.getMonth() &&
                 taskDate.getFullYear() === yesterday.getFullYear();
      });

      const total = yesterdayTasks.length;
      const completed = yesterdayTasks.filter(t => t.completed).length;
      const completionRate = total > 0 ? (completed / total) * 100 : 0;
      
      let newStreak = stats.streak;
      let newPoints = stats.points;
      
      // 1. Xử lý Streak hoàn thành Task (>= 80% TẤT CẢ tasks)
      if (total > 0 && completionRate >= 80) {
        newStreak = (stats.streak || 0) + 1;
        newPoints = (stats.points || 100) + 10; // Thưởng 10 điểm
        console.log(`Task streak success: ${completionRate}%`);
      } else if (total > 0) {
        newStreak = 0; // Reset streak
        console.log(`Task streak reset: ${completionRate}%`);
      }

      // 2. Xử lý Quỹ Cam Kết (Logic được viết lại)
      const commitment = await dbApi.getCommitment(userId);
      let newCommitmentStreak = commitment.streak;

      if (commitment.wager > 0 && commitment.taskIds && commitment.taskIds.length > 0) {
        // User có một cam kết đang hoạt động với các task cụ thể
        const committedTaskIds = new Set(commitment.taskIds);
        
        // Tìm các task đó trong *tất cả* tasks (vì chúng có thể là của ngày hôm qua)
        const committedTasks = allTasks.filter(t => committedTaskIds.has(t.id)); 
        
        const committedTotal = committedTasks.length;
        const committedCompleted = committedTasks.filter(t => t.completed).length;
        
        // QUY TẮC MỚI: Phải hoàn thành 100% các task đã cam kết
        const commitmentSuccess = (committedTotal > 0 && committedCompleted === committedTotal);

        if (commitmentSuccess) {
          // Hoàn thành cam kết
          newCommitmentStreak = (commitment.streak || 0) + 1;
          console.log(`Commitment success. New streak: ${newCommitmentStreak}`);
          if (newCommitmentStreak >= 3) {
            newPoints += commitment.wager; // Hoàn lại tiền
            console.log(`Commitment 3-day streak! ${commitment.wager} points refunded.`);
            // Reset cam kết sau khi hoàn tiền
            await dbApi.updateCommitment(userId, { wager: 0, streak: 0, taskIds: [] });
          } else {
             // Thắng, nhưng chưa đủ 3 ngày. Reset wager/tasks, giữ streak
             await dbApi.updateCommitment(userId, { wager: 0, streak: newCommitmentStreak, taskIds: [] });
          }
        } else if (committedTotal > 0) {
          // Thất bại cam kết
          newPoints -= commitment.wager; // Mất tiền
          console.log(`Commitment failed. Lost ${commitment.wager} points.`);
          // Reset cam kết
          await dbApi.updateCommitment(userId, { wager: 0, streak: 0, taskIds: [] });
        }
      }
      
      // Cập nhật stats
      await dbApi.updateStats(userId, {
        ...stats,
        points: newPoints,
        streak: newStreak,
        lastLogin: today.toISOString()
      });

      return {
        message: total > 0 
          ? `Đã xử lý ngày hôm qua: ${completed}/${total} tasks. Tỷ lệ: ${completionRate.toFixed(0)}%` 
          : 'Ngày mới! Chúc bạn làm việc hiệu quả!',
        streakReset: total > 0 && completionRate < 80,
        streakIncreased: total > 0 && completionRate >= 80
      };
    }
    return null; // Không phải ngày mới
  }
};

// --- TƯƠNG ĐƯƠNG `frontend/context/AuthContext.js` ---

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('hub_token') || null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  const fetchUserStats = async (userId) => {
    try {
      const userStats = await dbApi.getStats(userId);
      setStats(userStats);
    } catch (error) {
      console.error("Failed to fetch stats:", error);
    }
  };

  useEffect(() => {
    const initAuth = async () => {
      if (token) {
        try {
          const userData = await dbApi.getUserFromToken(token);
          if (userData) {
            setUser(userData);
            // Chạy kiểm tra hàng ngày
            const checkResult = await dbApi.runDailyCheck(userData.id);
            if (checkResult) {
               console.log(checkResult.message);
               // Có thể hiển thị thông báo cho user
            }
            await fetchUserStats(userData.id);
          } else {
            // Token không hợp lệ
            localStorage.removeItem('hub_token');
            setToken(null);
          }
        } catch (error) {
          console.error("Auth init error:", error);
          localStorage.removeItem('hub_token');
          setToken(null);
        }
      }
      setLoading(false);
    };
    initAuth();
  }, [token]);
  
  const login = async (username, password) => {
    const { token, user } = await dbApi.login(username, password);
    setToken(token);
    setUser(user);
    await fetchUserStats(user.id);
  };

  const signup = async (username, password) => {
    const { token, user } = await dbApi.signup(username, password);
    setToken(token);
    setUser(user);
    await fetchUserStats(user.id);
  };

  const logout = () => {
    dbApi.logout();
    setToken(null);
    setUser(null);
    setStats(null);
  };
  
  const updateStats = (newStats) => {
    setStats(newStats);
  };

  const value = {
    user,
    token,
    stats,
    isAuthenticated: !!user,
    loading,
    login,
    signup,
    logout,
    updateStats, // Để cập nhật điểm khi cần
    refreshStats: () => fetchUserStats(user.id)
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);

// --- TƯƠNG ĐƯƠNG `frontend/context/TaskContext.js` ---
// (Trong app này, ta sẽ quản lý task trong `DashboardPage` vì nó đơn giản hơn)

// --- TƯƠNG ĐƯƠNG `frontend/components/` ---

// --- PomodoroTimer.jsx ---
const PomodoroTimer = ({ onSessionComplete }) => {
  const [workDuration, setWorkDuration] = useState(25);
  const [breakDuration, setBreakDuration] = useState(5);

  const [minutes, setMinutes] = useState(workDuration);
  const [seconds, setSeconds] = useState(0);
  const [isActive, setIsActive] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  
  const intervalRef = useRef(null);

  // Cập nhật bộ đếm nếu thời lượng thay đổi khi không hoạt động
  useEffect(() => {
    if (!isActive && !isBreak) {
      setMinutes(workDuration);
      setSeconds(0);
    }
  }, [workDuration, isActive, isBreak]);

  useEffect(() => {
    if (!isActive && isBreak) {
      setMinutes(breakDuration);
      setSeconds(0);
    }
  }, [breakDuration, isActive, isBreak]);


  const startTimer = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setSeconds(s => {
        if (s === 0) {
          setMinutes(m => {
            if (m === 0) {
              // Hết giờ
              clearInterval(intervalRef.current);
              setIsActive(false);
              
              if (isBreak) {
                // Hết giờ nghỉ
                new Notification('Pomodoro', { body: 'Giờ nghỉ đã hết! Quay lại làm việc nào!' });
                resetTimer(false); // Quay lại_làm việc
              } else {
                // Hết giờ làm việc
                new Notification('Pomodoro', { body: 'Hết giờ làm việc! Tới giờ nghỉ ngơi!' });
                onSessionComplete(); // Ghi log phiên
                resetTimer(true); // Bắt đầu giờ nghỉ
              }
              return 0;
            }
            return m - 1;
          });
          return 59;
        }
        return s - 1;
      });
    }, 1000);
    setIsActive(true);
  };

  const pauseTimer = () => {
    clearInterval(intervalRef.current);
    setIsActive(false);
  };

  const resetTimer = (startBreak = false) => {
    clearInterval(intervalRef.current);
    setIsActive(false);
    if (startBreak) {
      setMinutes(breakDuration);
      setSeconds(0);
      setIsBreak(true);
    } else {
      setMinutes(workDuration);
      setSeconds(0);
      setIsBreak(false);
    }
  };
  
  // Xin quyền thông báo
  useEffect(() => {
    if (Notification.permission !== 'granted') {
      Notification.requestPermission();
    }
  }, []);

  // Clear interval khi component unmount
  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  const timeDisplay = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  
  // Tính toán phần trăm dựa trên thời lượng động
  const totalDurationInSeconds = isBreak ? breakDuration * 60 : workDuration * 60;
  const elapsedInSeconds = totalDurationInSeconds - (minutes * 60 + seconds);
  const progressPercent = totalDurationInSeconds > 0 ? (elapsedInSeconds / totalDurationInSeconds) * 100 : 0;


  return (
    <div className={`p-6 rounded-lg shadow-lg ${isBreak ? 'bg-green-100 dark:bg-green-900' : 'bg-white dark:bg-gray-800'}`}>
      <h2 className="text-xl font-bold text-center mb-4 text-gray-800 dark:text-gray-100">
        {isBreak ? 'Giờ nghỉ ngơi ☕' : 'Tập trung làm việc 🎯'}
      </h2>
      
      {/* Inputs để chỉnh thời gian (chỉ hiển thị khi không chạy) */}
      {!isActive && (
        <div className="flex justify-center gap-4 mb-4">
          <div className="text-center">
            <label htmlFor="workDuration" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Làm việc (phút)</label>
            <input
              id="workDuration"
              type="number"
              value={workDuration}
              onChange={(e) => setWorkDuration(Math.max(1, e.target.valueAsNumber || 1))}
              className="w-20 p-2 text-center border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="text-center">
            <label htmlFor="breakDuration" className="block text-sm font-medium text-gray-700 dark:text-gray-300">Nghỉ (phút)</label>
            <input
              id="breakDuration"
              type="number"
              value={breakDuration}
              onChange={(e) => setBreakDuration(Math.max(1, e.target.valueAsNumber || 1))}
              className="w-20 p-2 text-center border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
        </div>
      )}
      
      <div className="relative w-48 h-48 mx-auto mb-4">
        <svg className="w-full h-full" viewBox="0 0 100 100">
          <circle
            className="text-gray-200 dark:text-gray-700"
            strokeWidth="10"
            stroke="currentColor"
            fill="transparent"
            r="45"
            cx="50"
            cy="50"
          />
          <circle
            className={isBreak ? "text-green-500" : "text-blue-600"}
            strokeWidth="10"
            strokeDasharray="282.74"
            strokeDashoffset={282.74 - (progressPercent / 100) * 282.74}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r="45"
            cx="50"
            cy="50"
            style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.5s' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-5xl font-bold text-gray-900 dark:text-white">{timeDisplay}</span>
        </div>
      </div>
      
      <div className="flex justify-center space-x-4">
        {!isActive ? (
          <button
            onClick={startTimer}
            className={`flex items-center justify-center w-24 px-4 py-2 font-semibold text-white rounded-lg shadow-md transition-colors ${isBreak ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'} focus:outline-none focus:ring-2 focus:ring-offset-2 ${isBreak ? 'focus:ring-green-500' : 'focus:ring-blue-500'}`}
          >
            <Play size={20} className="mr-2" />
            Bắt đầu
          </button>
        ) : (
          <button
            onClick={pauseTimer}
            className="flex items-center justify-center w-24 px-4 py-2 font-semibold text-white bg-yellow-500 rounded-lg shadow-md hover:bg-yellow-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-400"
          >
            <Pause size={20} className="mr-2" />
            Tạm dừng
          </button>
        )}
        <button
          onClick={() => resetTimer(false)}
          className="flex items-center justify-center px-4 py-2 font-semibold text-gray-700 bg-gray-200 rounded-lg shadow-md hover:bg-gray-300 transition-colors dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
        >
          <RotateCcw size={20} />
        </button>
      </div>
    </div>
  );
};

// --- COMPONENT MỚI: Đồng hồ bấm giờ phụ ---
const SimpleStopwatch = () => {
  const [time, setTime] = useState(0); // Tính bằng giây
  const [isActive, setIsActive] = useState(false);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (isActive) {
      intervalRef.current = setInterval(() => {
        setTime(t => t + 1);
      }, 1000);
    } else {
      clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isActive]);

  const handleStartPause = () => {
    setIsActive(!isActive);
  };

  const handleReset = () => {
    setIsActive(false);
    setTime(0);
  };

  const formatTime = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  return (
    <div className="p-6 rounded-lg shadow-lg bg-white dark:bg-gray-800">
      <h2 className="text-xl font-bold text-center mb-4 text-gray-800 dark:text-gray-100 flex items-center justify-center gap-2">
        <Timer size={22} className="text-indigo-500" /> Đồng hồ bấm giờ
      </h2>
      <div className="text-5xl font-bold text-center text-gray-900 dark:text-white mb-6">
        {formatTime(time)}
      </div>
      <div className="flex justify-center space-x-4">
        <button
          onClick={handleStartPause}
          className={`flex items-center justify-center w-28 px-4 py-2 font-semibold text-white rounded-lg shadow-md transition-colors ${isActive ? 'bg-yellow-500 hover:bg-yellow-600 focus:ring-yellow-400' : 'bg-green-600 hover:bg-green-700 focus:ring-green-500'} focus:outline-none focus:ring-2 focus:ring-offset-2`}
        >
          {isActive ? <Pause size={20} className="mr-2" /> : <Play size={20} className="mr-2" />}
          {isActive ? 'Tạm dừng' : 'Bắt đầu'}
        </button>
        <button
          onClick={handleReset}
          className="flex items-center justify-center px-4 py-2 font-semibold text-gray-700 bg-gray-200 rounded-lg shadow-md hover:bg-gray-300 transition-colors dark:bg-gray-600 dark:text-gray-100 dark:hover:bg-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-400"
        >
          <RotateCcw size={20} />
        </button>
      </div>
    </div>
  );
};


// --- TaskList.jsx & TaskItem.jsx ---
const TaskItem = ({ task, onToggle, onDelete, onBreakdown, isBreakingDown }) => {
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete(task.id);
    // Component sẽ tự unmount
  };
  
  const handleToggle = () => {
    onToggle(task.id, { completed: !task.completed });
  };
  
  const hasDeadline = task.deadline;
  const deadlineDate = hasDeadline ? new Date(task.deadline) : null;
  const isOverdue = hasDeadline && !task.completed && deadlineDate < new Date();

  return (
    <li className={`flex items-center p-3 rounded-lg transition-all ${isDeleting ? 'opacity-0 scale-95' : 'opacity-100 scale-100'} ${task.completed ? 'bg-gray-50 dark:bg-gray-700' : 'bg-white dark:bg-gray-800'} shadow-sm`}>
      <button onClick={handleToggle} className="flex-shrink-0">
        {task.completed ? (
          <CheckCircle size={24} className="text-green-500" />
        ) : (
          <Circle size={24} className="text-gray-400 dark:text-gray-500" />
        )}
      </button>
      <div className="ml-3 flex-grow">
        <span className={`text-gray-800 dark:text-gray-100 ${task.completed ? 'line-through text-gray-500 dark:text-gray-400' : ''}`}>
          {task.text}
        </span>
        {hasDeadline && (
          <span className={`block text-xs mt-1 ${isOverdue ? 'text-red-500 font-semibold' : 'text-gray-500 dark:text-gray-400'}`}>
            Deadline: {deadlineDate.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
            {isOverdue && ' (Quá hạn!)'}
          </span>
        )}
      </div>
      {/* NÚT CHIA NHỎ TASK (AI) MỚI */}
      <button
        onClick={() => onBreakdown(task)}
        disabled={isBreakingDown}
        className="ml-2 p-1 text-gray-400 hover:text-blue-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        title="Chia nhỏ công việc ✨"
      >
        {isBreakingDown ? (
          <Loader2 size={18} className="animate-spin" />
        ) : (
          <Sparkles size={18} />
        )}
      </button>
      <button
        onClick={handleDelete}
        className="ml-2 p-1 text-gray-400 hover:text-red-500 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <Trash2 size={18} />
      </button>
    </li>
  );
};

const AddTaskForm = ({ onAddTask }) => {
  const [text, setText] = useState('');
  const [deadline, setDeadline] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onAddTask(text.trim(), deadline || null);
      setText('');
      setDeadline('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-white dark:bg-gray-800 rounded-lg shadow-md">
      <h3 className="font-semibold mb-2 dark:text-white">Thêm nhiệm vụ mới</h3>
      <div className="flex flex-col sm:flex-row gap-2">
         <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Bạn cần làm gì hôm nay?"
          className="flex-grow p-3 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="datetime-local"
          value={deadline}
          onChange={(e) => setDeadline(e.target.value)}
          className="p-3 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="flex-shrink-0 flex items-center justify-center px-5 py-3 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          <Plus size={20} />
        </button>
      </div>
    </form>
  );
};

// --- RewardPopup.jsx ---
const RewardPopup = ({ isOpen, onClose, streak }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 p-8 rounded-xl shadow-2xl transform transition-all scale-100 opacity-100"
        onClick={(e) => e.stopPropagation()} // Ngăn popup đóng khi click vào nội dung
      >
        <div className="text-center">
          <Award size={64} className="mx-auto text-yellow-500" />
          <h2 className="text-3xl font-bold mt-4 text-gray-900 dark:text-white">Tuyệt vời!</h2>
          <p className="text-lg mt-2 text-gray-600 dark:text-gray-300">
            Bạn đã hoàn thành tất cả nhiệm vụ hôm nay!
          </p>
          {streak > 1 && (
             <p className="text-xl font-semibold mt-4 text-blue-600 dark:text-blue-400">
              Chuỗi hoàn thành: {streak} ngày! 🔥
            </p>
          )}
          <button
            onClick={onClose}
            className="mt-6 px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Tiếp tục
          </button>
        </div>
      </div>
    </div>
  );
};

// --- ProgressBar.jsx ---
// THAY THẾ ProgressBar BẰNG ProgressOverview MỚI
const ProgressOverview = ({ tasks, stats }) => {
  const totalTasks = tasks.length;
  const completedTasks = tasks.filter(t => t.completed).length;
  const percentage = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
  
  // Ước tính thời gian
  // Giả định 1 task = 1 pomodoro 25 phút
  const totalEstimatedMinutes = totalTasks * 25; 
  // Lấy từ pomodoro đã hoàn thành (cũng giả định 25 phút/phiên)
  // Để chính xác hơn, chúng ta nên lấy workDuration từ PomodoroTimer, 
  // nhưng hiện tại nó là state cục bộ. 25 là một giả định tốt.
  const doneMinutes = (stats?.totalPomodoros || 0) * 25; 

  return (
    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md text-center">
      
      {/* Percentage */}
      <div className="text-6xl font-bold text-gray-900 dark:text-white mb-2">
        {percentage.toFixed(0)}%
      </div>
      <p className="text-gray-500 dark:text-gray-400 mb-4">
        {completedTasks} / {totalTasks} công việc đã hoàn thành
      </p>

      {/* Progress Bar */}
      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mb-6">
        <div
          className="bg-blue-600 h-3 rounded-full transition-all duration-500"
          style={{ width: `${percentage}%` }}
        ></div>
      </div>

      {/* 2x2 Grid Stats */}
      <div className="grid grid-cols-2 gap-y-4 gap-x-2 text-center">
        {/* Hàng 1 */}
        <div className="border-r border-gray-200 dark:border-gray-700 px-2">
          <span className="block text-3xl font-bold text-gray-800 dark:text-gray-100">{totalTasks}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">Tổng công việc</span>
        </div>
        <div className="px-2">
          <span className="block text-3xl font-bold text-gray-800 dark:text-gray-100">{completedTasks}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">Đã hoàn thành</span>
        </div>
        
        {/* Hàng 2 */}
        <div className="border-r border-gray-200 dark:border-gray-700 pt-4 px-2">
          <span className="block text-3xl font-bold text-gray-800 dark:text-gray-100">{totalEstimatedMinutes}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">Tổng thời gian (phút)</span>
        </div>
        <div className="pt-4 px-2">
          <span className="block text-3xl font-bold text-gray-800 dark:text-gray-100">{doneMinutes}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">Đã làm (phút)</span>
        </div>
      </div>
    </div>
  );
};


// --- StatsDisplay.jsx ---
const StatsDisplay = () => {
  const { stats } = useAuth();
  if (!stats) return null;

  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
      <h3 className="font-semibold mb-3 text-gray-800 dark:text-gray-100">Thống kê của bạn</h3>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <span className="block text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.points || 0}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">Điểm</span>
        </div>
        <div>
          <span className="block text-3xl font-bold text-orange-500">{stats.streak || 0} 🔥</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">Streak</span>
        </div>
        <div>
          <span className="block text-3xl font-bold text-green-500">{stats.totalPomodoros || 0}</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">Pomodoros</span>
        </div>
      </div>
    </div>
  );
};

// --- COMPONENT MODAL MỚI CHO GEMINI ---
const TaskSuggestionModal = ({ isOpen, onClose, onAddTasks }) => {
  const [goal, setGoal] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]); // [{ taskName: "..." }]
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleGenerate = async () => {
    if (!goal.trim()) {
      setError("Vui lòng nhập một mục tiêu.");
      return;
    }
    setIsLoading(true);
    setError(null);
    setSuggestions([]);
    
    try {
      const prompt = `Với vai trò là một cố vấn học tập, hãy đề xuất một danh sách các công việc chi tiết cần làm để đạt được mục tiêu sau: "${goal}". Chỉ trả về các công việc chính.`;
      const result = await callGeminiApiWithJson(prompt);
      if (!result || result.length === 0) {
        setError("AI không thể tạo gợi ý cho mục tiêu này. Vui lòng thử lại.");
      } else {
        setSuggestions(result);
        // Tự động chọn tất cả task
        const allTaskNames = new Set(result.map(t => t.taskName));
        setSelectedTasks(allTaskNames);
      }
    } catch (err) {
      console.error(err);
      setError("Đã xảy ra lỗi khi gọi AI. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleTask = (taskName) => {
    setSelectedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskName)) {
        newSet.delete(taskName);
      } else {
        newSet.add(taskName);
      }
      return newSet;
    });
  };

  const handleAddSelected = () => {
    onAddTasks(Array.from(selectedTasks));
    // Reset state
    setGoal('');
    setSuggestions([]);
    setSelectedTasks(new Set());
    setError(null);
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-70 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-2xl w-full max-w-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Sparkles className="text-purple-500" />
            Trợ lý AI Gợi Ý Nhiệm Vụ
          </h2>
          <button onClick={onClose} className="p-1 rounded-full text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700">
            <X size={24} />
          </button>
        </div>

        {!isLoading && suggestions.length === 0 && (
          <div className="space-y-4">
            <p className="text-gray-600 dark:text-gray-300">Nhập mục tiêu hoặc dự án của bạn (ví dụ: "Viết luận văn", "Học thi cuối kỳ", "Làm đồ án môn OOP"). AI sẽ giúp bạn chia nhỏ thành các nhiệm vụ cụ thể.</p>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="Ví dụ: Chuẩn bị thuyết trình môn Marketing..."
              className="w-full p-3 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              rows={3}
            />
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={handleGenerate}
              className="w-full px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
            >
              Tạo gợi ý
            </button>
          </div>
        )}

        {isLoading && (
          <div className="flex flex-col items-center justify-center h-48">
            <Loader2 size={48} className="animate-spin text-purple-500" />
            <p className="mt-4 text-gray-600 dark:text-gray-300">AI đang suy nghĩ...</p>
          </div>
        )}

        {!isLoading && suggestions.length > 0 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-gray-800 dark:text-gray-100">Các nhiệm vụ được đề xuất cho: "{goal}"</h3>
            <div className="max-h-64 overflow-y-auto space-y-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
              {suggestions.map((task) => (
                <label key={task.taskName} className="flex items-center p-3 bg-white dark:bg-gray-800 rounded shadow-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600">
                  <input
                    type="checkbox"
                    checked={selectedTasks.has(task.taskName)}
                    onChange={() => handleToggleTask(task.taskName)}
                    className="h-5 w-5 rounded text-purple-600 border-gray-300 focus:ring-purple-500"
                  />
                  <span className="ml-3 text-gray-800 dark:text-gray-100">{task.taskName}</span>
                </label>
              ))}
            </div>
            {error && <p className="text-red-500 text-sm">{error}</p>}
            <button
              onClick={handleAddSelected}
              disabled={selectedTasks.size === 0}
              className="w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
            >
              Thêm {selectedTasks.size} nhiệm vụ đã chọn
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


// --- TƯƠNG ĐƯƠNG `frontend/pages/` ---

// --- Header (Navbar) ---
const Header = ({ onNavigate, isDarkMode, toggleDarkMode }) => {
  const { user, logout } = useAuth();

  return (
    <header className="bg-white dark:bg-gray-800 shadow-md">
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex-shrink-0 flex items-center">
            <Database size={28} className="text-blue-600" />
            <span className="ml-2 text-xl font-bold text-gray-900 dark:text-white">StudentHub</span>
          </div>
          <div className="flex items-center space-x-4">
            <button 
              onClick={() => onNavigate('dashboard')}
              className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Dashboard
            </button>
            <button 
              onClick={() => onNavigate('commitment')}
              className="text-gray-700 dark:text-gray-300 hover:text-blue-600 dark:hover:text-blue-400 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              Quỹ cam kết
            </button>
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-full text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <span className="text-gray-700 dark:text-gray-300 text-sm">Chào, {user.username}</span>
            <button
              onClick={logout}
              className="flex items-center text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-500 px-3 py-2 rounded-md text-sm font-medium transition-colors"
            >
              <LogOut size={18} className="mr-1" />
              Đăng xuất
            </button>
          </div>
        </div>
      </nav>
    </header>
  );
};

// --- Dashboard.jsx ---
const DashboardPage = () => {
  const { user, stats, refreshStats } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showReward, setShowReward] = useState(false);
  const [hasCheckedCompletion, setHasCheckedCompletion] = useState(false);
  
  // State mới cho các tính năng AI
  const [breakingDownTaskId, setBreakingDownTaskId] = useState(null); // ID của task đang được AI chia nhỏ
  const [isSuggestModalOpen, setIsSuggestModalOpen] = useState(false); // Trạng thái mở/đóng modal gợi ý
  
  // Lấy tasks khi component mount
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoading(true);
        const fetchedTasks = await dbApi.getTasks(user.id);
        setTasks(fetchedTasks);
        
        // Kiểm tra xem đã hoàn thành 100% chưa
        const allCompleted = fetchedTasks.length > 0 && fetchedTasks.every(t => t.completed);
        if (allCompleted) {
          setHasCheckedCompletion(true);
        }
        
      } catch (error) {
        console.error("Failed to fetch tasks:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, [user.id]);

  // Kiểm tra hoàn thành task để hiện popup
  useEffect(() => {
    if (tasks.length > 0 && !hasCheckedCompletion) {
      const allCompleted = tasks.every(t => t.completed);
      if (allCompleted) {
        setShowReward(true);
        setHasCheckedCompletion(true);
        // Logic 80% được xử lý ở daily check, 
        // ở đây ta thưởng cho 100%
      }
    }
  }, [tasks, hasCheckedCompletion]);

  const handleAddTask = async (text, deadline) => {
    try {
      const newTask = await dbApi.addTask(user.id, text, deadline);
      setTasks(prevTasks => [...prevTasks, newTask]);
      setHasCheckedCompletion(false); // Reset khi thêm task mới
    } catch (error) {
      console.error("Failed to add task:", error);
    }
  };

  const handleToggleTask = async (taskId, updates) => {
    try {
      const updatedTask = await dbApi.updateTask(user.id, taskId, updates);
      setTasks(prevTasks => prevTasks.map(t => (t.id === taskId ? updatedTask : t)));
    } catch (error) {
      console.error("Failed to update task:", error);
    }
  };

  const handleDeleteTask = async (taskId) => {
    try {
      await dbApi.deleteTask(user.id, taskId);
      setTasks(prevTasks => prevTasks.filter(t => t.id !== taskId));
    } catch (error) {
      console.error("Failed to delete task:", error);
    }
  };

  const handlePomodoroComplete = async () => {
    try {
      await dbApi.logPomodoroSession(user.id);
      refreshStats(); // Cập nhật lại stats (gồm totalPomodoros)
    } catch (error) {
      console.error("Failed to log pomodoro:", error);
    }
  };

  // --- HÀM MỚI: Xử lý chia nhỏ task bằng AI ---
  const handleBreakdownTask = async (taskToBreakdown) => {
    if (breakingDownTaskId) return; // Đang xử lý task khác
    
    setBreakingDownTaskId(taskToBreakdown.id);
    try {
      // 1. Gọi Gemini
      const prompt = `Hãy chia nhỏ công việc sau thành các công việc con thực tế, chỉ trả lời bằng danh sách các công việc, mỗi công việc trên một dòng, không có gạch đầu dòng hay đánh số, không thêm lời giới thiệu: "${taskToBreakdown.text}"`;
      const resultText = await callGeminiApi(prompt);
      
      // 2. Parse kết quả
      const subTasks = resultText.split('\n').filter(t => t.trim().length > 0);
      
      if (subTasks.length === 0) {
        throw new Error("AI không thể chia nhỏ task này.");
      }

      // 3. Thêm các task con mới
      // Dùng Promise.all để thêm đồng thời (hoặc tuần tự nếu muốn giữ thứ tự)
      for (const subTaskText of subTasks) {
        // Thêm tiền tố của task cha để dễ nhận biết
        await handleAddTask(`[${taskToBreakdown.text.substring(0, 15)}...] ${subTaskText}`, taskToBreakdown.deadline);
      }

      // 4. Xóa task cha
      await handleDeleteTask(taskToBreakdown.id);

    } catch (error) {
      console.error("Failed to breakdown task:", error);
      // Sử dụng một thông báo popup thay vì alert
      alert("Lỗi khi chia nhỏ công việc. Vui lòng thử lại."); 
    } finally {
      setBreakingDownTaskId(null); // Hoàn tất
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
      <RewardPopup isOpen={showReward} onClose={() => setShowReward(false)} streak={stats?.streak || 0} />
      
      {/* Modal gợi ý AI */}
      <TaskSuggestionModal
        isOpen={isSuggestModalOpen}
        onClose={() => setIsSuggestModalOpen(false)}
        onAddTasks={(tasksTextArray) => {
          // Thêm các task đã chọn
          tasksTextArray.forEach(text => handleAddTask(text, null));
          setIsSuggestModalOpen(false);
        }}
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Cột chính (Tasks) */}
        <div className="lg:col-span-2 space-y-6">
          <StatsDisplay />
          
          {/* NÚT MỚI GỌI GEMINI */}
          <button
            onClick={() => setIsSuggestModalOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-purple-500 to-blue-600 text-white font-semibold rounded-lg shadow-lg hover:from-purple-600 hover:to-blue-700 transition-all transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500"
          >
            <Sparkles size={20} />
            ✨ Gợi ý nhiệm vụ với AI
          </button>
          
          <AddTaskForm onAddTask={handleAddTask} />
          <div className="bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Nhiệm vụ hôm nay</h2>
            {/* THAY THẾ ProgressBar BẰNG ProgressOverview MỚI */}
            <ProgressOverview tasks={tasks} stats={stats} />
            {loading ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-4">Đang tải nhiệm vụ...</p>
            ) : tasks.length === 0 ? (
              <p className="text-center text-gray-500 dark:text-gray-400 py-4">Chưa có nhiệm vụ nào cho hôm nay. Thêm một cái nhé!</p>
            ) : (
              <ul className="space-y-3 mt-4">
                {tasks.filter(t => !t.completed).map(task => (
                  <TaskItem 
                    key={task.id} 
                    task={task} 
                    onToggle={handleToggleTask} 
                    onDelete={handleDeleteTask}
                    onBreakdown={handleBreakdownTask}
                    isBreakingDown={breakingDownTaskId === task.id}
                  />
                ))}
                {tasks.filter(t => t.completed).length > 0 && (
                  <li className="pt-4">
                     <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase">Đã hoàn thành</h3>
                  </li>
                )}
                 {tasks.filter(t => t.completed).map(task => (
                  <TaskItem 
                    key={task.id} 
                    task={task} 
                    onToggle={handleToggleTask} 
                    onDelete={handleDeleteTask}
                    onBreakdown={handleBreakdownTask}
                    isBreakingDown={breakingDownTaskId === task.id}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Cột phụ (Pomodoro) */}
        <div className="lg:col-span-1 space-y-6">
          <PomodoroTimer onSessionComplete={handlePomodoroComplete} />
          {/* Thêm đồng hồ bấm giờ phụ mới ở đây */}
          <SimpleStopwatch />
          {/* Có thể thêm các widget khác ở đây */}
        </div>
      </div>
    </div>
  );
};

// --- CommitmentFundPage.jsx ---
const CommitmentFundPage = () => {
  const { user, stats, refreshStats } = useAuth();
  const [commitment, setCommitment] = useState(null);
  const [tasks, setTasks] = useState([]); // State mới để giữ task
  const [selectedIds, setSelectedIds] = useState(new Set()); // State mới cho các task được chọn
  const [loading, setLoading] = useState(true);
  const [wagerAmount, setWagerAmount] = useState(50);
  
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Lấy cả commitment và tasks
        const commitData = await dbApi.getCommitment(user.id);
        setCommitment(commitData);
        
        // Chỉ lấy các task của ngày hôm nay
        const taskData = await dbApi.getTasks(user.id);
        setTasks(taskData);
        
      } catch (error) {
        console.error("Failed to fetch data:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [user.id]);

  // Handler mới để chọn/bỏ chọn task
  const handleToggleTaskSelection = (taskId) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const handleSetCommitment = async () => {
    if (selectedIds.size === 0) {
      alert("Bạn phải chọn ít nhất một nhiệm vụ để cam kết.");
      return;
    }
    if (wagerAmount <= 0) {
      alert("Số điểm cược phải lớn hơn 0");
      return;
    }
    if (stats.points < wagerAmount) {
      alert("Bạn không đủ điểm để cược");
      return;
    }
    
    try {
      const newCommitment = { 
        wager: wagerAmount, 
        streak: commitment.streak || 0, // Giữ streak cũ
        taskIds: Array.from(selectedIds) // Thêm các task ID
      };
      await dbApi.updateCommitment(user.id, newCommitment);
      setCommitment(newCommitment);
      setSelectedIds(new Set()); // Xóa lựa chọn
      alert(`Cam kết thành công! Cược ${wagerAmount} điểm cho ${selectedIds.size} nhiệm vụ.`);
    } catch (error) {
      console.error("Failed to set commitment:", error);
    }
  };

  const handleCancelCommitment = async () => {
     try {
      // Giữ lại streak, reset wager và taskIds
      const newCommitment = { wager: 0, streak: commitment.streak, taskIds: [] };
      await dbApi.updateCommitment(user.id, newCommitment);
      setCommitment(newCommitment);
      alert("Đã hủy cam kết.");
    } catch (error) {
      console.error("Failed to cancel commitment:", error);
    }
  };

  if (loading || !commitment || !stats || !tasks) {
    return <div className="text-center p-10 dark:text-white">Đang tải...</div>;
  }

  const hasActiveCommitment = commitment.wager > 0 && commitment.taskIds.length > 0;
  
  // Lọc các task đã cam kết
  const committedTasks = hasActiveCommitment 
    ? tasks.filter(t => commitment.taskIds.includes(t.id))
    : [];
    
  // Lọc các task có thể chọn (chưa hoàn thành và chưa cam kết)
  const availableTasks = hasActiveCommitment
    ? []
    : tasks.filter(t => !t.completed);

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="bg-white dark:bg-gray-800 p-8 rounded-lg shadow-xl">
        <div className="text-center">
          <Target size={48} className="mx-auto text-red-600" />
          <h1 className="text-3xl font-bold my-4 text-gray-900 dark:text-white">Quỹ Cam Kết</h1>
          <p className="text-lg text-gray-600 dark:text-gray-300 mb-6">
            Chọn các nhiệm vụ cụ thể và đặt cược điểm. Hoàn thành 100% nhiệm vụ đã chọn để tăng chuỗi.
            Đạt 3 ngày liên tiếp, bạn được hoàn lại số điểm đã cược. Nếu thất bại, bạn mất số điểm đó.
          </p>
          
          <div className="text-2xl font-bold mb-6 text-gray-800 dark:text-gray-100">
            Số điểm hiện tại: <span className="text-blue-600 dark:text-blue-400">{stats.points}</span>
          </div>
        </div>

        {hasActiveCommitment ? (
          // --- GIAO DIỆN KHI ĐANG CÓ CAM KẾT ---
          <div className="bg-blue-50 dark:bg-blue-900 p-6 rounded-lg">
            <h3 className="text-xl font-semibold text-blue-800 dark:text-blue-200 text-center">Cam kết hiện tại</h3>
            <p className="text-4xl font-bold text-blue-600 dark:text-blue-400 my-4 text-center">{commitment.wager} điểm</p>
            <p className="text-lg text-blue-700 dark:text-blue-300 text-center mb-4">
              Chuỗi hiện tại: <span className="font-bold">{commitment.streak} / 3 ngày</span>
            </p>
            
            <h4 className="font-semibold text-gray-800 dark:text-gray-100 mb-2">Nhiệm vụ đã cam kết:</h4>
            {committedTasks.length > 0 ? (
              <ul className="space-y-2">
                {committedTasks.map(task => (
                  <li key={task.id} className={`flex items-center p-3 rounded-lg bg-white dark:bg-gray-800 shadow-sm ${task.completed ? 'opacity-70' : ''}`}>
                    {task.completed ? <CheckCircle size={20} className="text-green-500 mr-3" /> : <Circle size={20} className="text-blue-500 mr-3" />}
                    <span className={`dark:text-gray-100 ${task.completed ? 'line-through' : ''}`}>{task.text}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-center text-gray-500 dark:text-gray-400 italic">Các nhiệm vụ đã cam kết (có thể của ngày hôm qua) không có ở đây.</p>
            )}
             
             <button
              onClick={handleCancelCommitment}
              className="mt-6 w-full px-6 py-3 bg-red-600 text-white font-semibold rounded-lg shadow-md hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
            >
              Hủy Cam Kết
            </button>
          </div>
        ) : (
          // --- GIAO DIỆN TẠO CAM KẾT MỚI ---
          <div className="bg-gray-50 dark:bg-gray-700 p-6 rounded-lg">
            <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100 mb-4">Tạo cam kết mới</h3>
            <p className="text-gray-600 dark:text-gray-300 mb-2">
              Chuỗi cam kết hiện tại: {commitment.streak} ngày.
            </p>
            
            {/* Chọn nhiệm vụ */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">1. Chọn các nhiệm vụ để cam kết:</label>
              <div className="max-h-48 overflow-y-auto space-y-2 p-3 bg-white dark:bg-gray-800 rounded-lg border dark:border-gray-600">
                {availableTasks.length > 0 ? availableTasks.map(task => (
                  <label key={task.id} className="flex items-center p-2 rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600">
                    <input 
                      type="checkbox"
                      checked={selectedIds.has(task.id)}
                      onChange={() => handleToggleTaskSelection(task.id)}
                      className="h-5 w-5 rounded text-blue-600 border-gray-300 dark:border-gray-500 dark:bg-gray-700 focus:ring-blue-500"
                    />
                    <span className="ml-3 text-gray-800 dark:text-gray-100">{task.text}</span>
                  </label>
                )) : (
                  <p className="text-center text-gray-500 dark:text-gray-400 p-3">Bạn không có nhiệm vụ nào (chưa hoàn thành) để cam kết. Hãy quay lại Dashboard và thêm nhiệm vụ mới!</p>
                )}
              </div>
            </div>
            
            {/* Chọn số tiền cược */}
            <div className="mb-6">
              <label htmlFor="wagerAmount" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-2">2. Nhập số điểm cược:</label>
              <input 
                id="wagerAmount"
                type="number"
                value={wagerAmount}
                onChange={(e) => setWagerAmount(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-full p-3 text-lg border border-gray-300 rounded-lg dark:bg-gray-800 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {wagerAmount > stats.points && (
                <p className="text-red-500 text-sm mt-2">Bạn không đủ điểm!</p>
              )}
            </div>

            <button
              onClick={handleSetCommitment}
              disabled={selectedIds.size === 0 || wagerAmount <= 0 || wagerAmount > stats.points}
              className="w-full px-6 py-3 bg-green-600 text-white font-semibold rounded-lg shadow-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
            >
              Cam Kết {selectedIds.size} Nhiệm Vụ
            </button>
          </div>
        )}
      </div>
    </div>
  );
};


// --- AuthPage (Login/Signup) ---
const AuthPage = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login, signup } = useAuth();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (isLogin) {
        await login(username, password);
      } else {
        await signup(username, password);
      }
      // Provider sẽ tự động chuyển trang
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
      <div className="w-full max-w-md p-8 space-y-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
        <div className="text-center">
          <Database size={40} className="mx-auto text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
            Chào mừng tới StudentHub
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {isLogin ? 'Đăng nhập để tiếp tục' : 'Tạo tài khoản mới'}
          </p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label 
              htmlFor="username" 
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Tên người dùng
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full p-3 mt-1 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label 
              htmlFor="password" 
              className="block text-sm font-medium text-gray-700 dark:text-gray-300"
            >
              Mật khẩu
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full p-3 mt-1 border border-gray-300 rounded-lg dark:bg-gray-700 dark:border-gray-600 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          {error && <p className="text-sm text-red-500">{error}</p>}
          
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 font-semibold text-white bg-blue-600 rounded-lg shadow-md hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {loading ? 'Đang xử lý...' : (isLogin ? 'Đăng nhập' : 'Đăng ký')}
          </button>
        </form>
        
        <p className="text-sm text-center text-gray-600 dark:text-gray-400">
          {isLogin ? 'Chưa có tài khoản?' : 'Đã có tài khoản?'}
          <button
            onClick={() => { setIsLogin(!isLogin); setError(null); }}
            className="ml-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {isLogin ? 'Đăng ký' : 'Đăng nhập'}
          </button>
        </p>
      </div>
    </div>
  );
};

// --- TƯƠNG ĐƯƠNG `frontend/App.jsx` ---
// (Component App chính quản lý routing)

const AppContent = () => {
  const { isAuthenticated } = useAuth();
  const [page, setPage] = useState('dashboard'); // 'dashboard' | 'commitment'
  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (localStorage.theme === 'dark') {
      return true;
    }
    return !('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.theme = 'dark';
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.theme = 'light';
    }
  }, [isDarkMode]);

  const toggleDarkMode = () => setIsDarkMode(!isDarkMode);
  
  if (!isAuthenticated) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors">
      <Header onNavigate={setPage} isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />
      <main>
        {page === 'dashboard' && <DashboardPage />}
        {page === 'commitment' && <CommitmentFundPage />}
      </main>
    </div>
  );
};

// --- Component gốc ---
export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}