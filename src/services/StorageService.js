import { saveData, getData, removeData, batchGetData, batchSaveData, clearAllData } from '../utils/StorageUtils';
import { logError, handleAsyncError } from '../utils/ErrorHandler';

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  
  result.push(current);
  return result;
}

class StorageService {
  static #cache = new Map();
  static #cacheTTL = 5 * 60 * 1000; // 5分钟缓存
  static #cacheTimestamps = new Map();

  // 缓存管理
  static #getFromCache(key) {
    const timestamp = this.#cacheTimestamps.get(key);
    if (timestamp && Date.now() - timestamp < this.#cacheTTL) {
      return this.#cache.get(key);
    }
    this.#cache.delete(key);
    this.#cacheTimestamps.delete(key);
    return undefined;
  }

  static #setToCache(key, value) {
    this.#cache.set(key, value);
    this.#cacheTimestamps.set(key, Date.now());
  }

  static #clearCache(key) {
    if (key) {
      this.#cache.delete(key);
      this.#cacheTimestamps.delete(key);
    } else {
      this.#cache.clear();
      this.#cacheTimestamps.clear();
    }
  }

  // 设备相关操作
  /**
   * 获取所有器件数据
   * @returns {Promise<Array>} 器件数据数组
   */
  static async getDevices() {
    try {
      const cached = this.#getFromCache('devices');
      if (cached) return cached;
      
      const devices = await getData('devices', []);
      this.#setToCache('devices', devices);
      return devices;
    } catch (error) {
      logError('获取设备数据失败', error, 'StorageService.getDevices');
      return [];
    }
  }

  /**
   * 保存器件数据
   * @param {Array} devices - 器件数据数组
   * @returns {Promise<void>}
   */
  static async saveDevices(devices) {
    try {
      await saveData('devices', devices);
      this.#setToCache('devices', devices);
    } catch (error) {
      logError('保存设备数据失败', error, 'StorageService.saveDevices');
      throw error;
    }
  }

  /**
   * 添加新器件
   * @param {Object} device - 器件数据
   * @returns {Promise<Object>} 添加的器件数据
   */
  static async addDevice(device) {
    try {
      const devices = await this.getDevices();
      
      if (device.id) {
        const existingDevice = devices.find(d => d.id === device.id);
        if (existingDevice) {
          throw new Error(`器件编号 ${device.id} 已存在`);
        }
      }
      
      const newDevice = {
        ...device,
        id: device.id || (devices.length > 0 ? Math.max(...devices.map(d => d.id)) + 1 : 1),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      
      devices.push(newDevice);
      await this.saveDevices(devices);
      return newDevice;
    } catch (error) {
      logError('添加设备失败', error, 'StorageService.addDevice');
      throw error;
    }
  }

  /**
   * 更新器件数据
   * @param {Object} updatedDevice - 更新后的器件数据
   * @returns {Promise<Object|null>} 更新后的器件数据
   */
  static async updateDevice(updatedDevice) {
    try {
      const devices = await this.getDevices();
      const index = devices.findIndex(d => d.id === updatedDevice.id);
      if (index !== -1) {
        const updated = {
          ...updatedDevice,
          updatedAt: new Date().toISOString()
        };
        devices[index] = updated;
        await this.saveDevices(devices);
        return updated;
      }
      return null;
    } catch (error) {
      logError('更新设备失败', error, 'StorageService.updateDevice');
      throw error;
    }
  }

  /**
   * 删除器件
   * @param {number} deviceId - 器件ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  static async deleteDevice(deviceId) {
    try {
      const devices = await this.getDevices();
      const updatedDevices = devices.filter(d => d.id !== deviceId);
      await this.saveDevices(updatedDevices);
      return true;
    } catch (error) {
      logError('删除设备失败', error, 'StorageService.deleteDevice');
      throw error;
    }
  }

  /**
   * 根据ID获取器件
   * @param {number} deviceId - 器件ID
   * @returns {Promise<Object|null>} 器件数据
   */
  static async getDeviceById(deviceId) {
    try {
      const devices = await this.getDevices();
      return devices.find(d => d.id === deviceId) || null;
    } catch (error) {
      logError('根据ID获取设备失败', error, 'StorageService.getDeviceById');
      return null;
    }
  }

  // 用户相关操作
  /**
   * 获取所有用户数据
   * @returns {Promise<Array>} 用户数据数组
   */
  static async getUsers() {
    try {
      const cached = this.#getFromCache('users');
      if (cached) return cached;
      
      const users = await getData('users');
      if (users) {
        this.#setToCache('users', users);
        return users;
      } else {
        // 默认用户
        const defaultUsers = [
          { username: 'admin', password: 'admin', isAdmin: true, createdAt: new Date().toISOString() },
          { username: 'user', password: 'user', isAdmin: false, createdAt: new Date().toISOString() }
        ];
        await this.saveUsers(defaultUsers);
        return defaultUsers;
      }
    } catch (error) {
      logError('获取用户数据失败', error, 'StorageService.getUsers');
      return [];
    }
  }

  /**
   * 保存用户数据
   * @param {Array} users - 用户数据数组
   * @returns {Promise<void>}
   */
  static async saveUsers(users) {
    try {
      await saveData('users', users);
      this.#setToCache('users', users);
    } catch (error) {
      logError('保存用户数据失败', error, 'StorageService.saveUsers');
      throw error;
    }
  }

  /**
   * 根据用户名获取用户
   * @param {string} username - 用户名
   * @returns {Promise<Object|null>} 用户数据
   */
  static async getUserByUsername(username) {
    try {
      const users = await this.getUsers();
      return users.find(u => u.username === username) || null;
    } catch (error) {
      logError('根据用户名获取用户失败', error, 'StorageService.getUserByUsername');
      return null;
    }
  }

  // 搜索历史相关操作
  /**
   * 获取搜索历史
   * @param {number} limit - 限制数量
   * @returns {Promise<Array>} 搜索历史数组
   */
  static async getSearchHistory(limit = 10) {
    try {
      const cached = this.#getFromCache('searchHistory');
      if (cached) return cached.slice(0, limit);
      
      const history = await getData('searchHistory', []);
      const limitedHistory = history.slice(0, limit);
      this.#setToCache('searchHistory', limitedHistory);
      return limitedHistory;
    } catch (error) {
      logError('获取搜索历史失败', error, 'StorageService.getSearchHistory');
      return [];
    }
  }

  /**
   * 添加搜索历史
   * @param {string} keyword - 搜索关键词
   * @returns {Promise<void>}
   */
  static async addSearchHistory(keyword) {
    try {
      if (!keyword || typeof keyword !== 'string' || !keyword.trim()) {
        return;
      }
      
      const history = await this.getSearchHistory(100);
      const trimmedKeyword = keyword.trim();
      
      // 移除重复项
      const filteredHistory = history.filter(item => item !== trimmedKeyword);
      // 添加到开头
      const newHistory = [trimmedKeyword, ...filteredHistory].slice(0, 10);
      
      await this.saveSearchHistory(newHistory);
    } catch (error) {
      logError('添加搜索历史失败', error, 'StorageService.addSearchHistory');
    }
  }

  /**
   * 保存搜索历史
   * @param {Array} history - 搜索历史数组
   * @returns {Promise<void>}
   */
  static async saveSearchHistory(history) {
    try {
      await saveData('searchHistory', history);
      this.#setToCache('searchHistory', history);
    } catch (error) {
      logError('保存搜索历史失败', error, 'StorageService.saveSearchHistory');
      throw error;
    }
  }

  /**
   * 清除搜索历史
   * @returns {Promise<void>}
   */
  static async clearSearchHistory() {
    try {
      await removeData('searchHistory');
      this.#clearCache('searchHistory');
    } catch (error) {
      logError('清除搜索历史失败', error, 'StorageService.clearSearchHistory');
      throw error;
    }
  }

  // 表单状态相关操作
  /**
   * 获取表单状态
   * @returns {Promise<Object>} 表单状态对象
   */
  static async getFormState() {
    try {
      const cached = this.#getFromCache('formState');
      if (cached) return cached;
      
      const formState = await getData('formState', {});
      this.#setToCache('formState', formState);
      return formState;
    } catch (error) {
      logError('获取表单状态失败', error, 'StorageService.getFormState');
      return {};
    }
  }

  /**
   * 保存表单状态
   * @param {Object} formState - 表单状态对象
   * @returns {Promise<void>}
   */
  static async saveFormState(formState) {
    try {
      await saveData('formState', formState);
      this.#setToCache('formState', formState);
    } catch (error) {
      logError('保存表单状态失败', error, 'StorageService.saveFormState');
      throw error;
    }
  }

  // 批量操作
  /**
   * 批量获取数据
   * @param {Array} keys - 存储键名数组
   * @returns {Promise<Object>} 键值对对象
   */
  static async batchGet(keys) {
    try {
      // 先从缓存获取
      const cachedData = {};
      const keysToFetch = [];
      
      for (const key of keys) {
        const cached = this.#getFromCache(key);
        if (cached) {
          cachedData[key] = cached;
        } else {
          keysToFetch.push(key);
        }
      }
      
      // 从存储获取剩余的
      if (keysToFetch.length > 0) {
        const fetchedData = await batchGetData(keysToFetch);
        // 更新缓存
        for (const [key, value] of Object.entries(fetchedData)) {
          if (value !== undefined) {
            this.#setToCache(key, value);
          }
        }
        return { ...cachedData, ...fetchedData };
      }
      
      return cachedData;
    } catch (error) {
      logError('批量获取数据失败', error, 'StorageService.batchGet');
      return {};
    }
  }

  /**
   * 批量保存数据
   * @param {Object} keyValuePairs - 键值对对象
   * @returns {Promise<void>}
   */
  static async batchSet(keyValuePairs) {
    try {
      await batchSaveData(keyValuePairs);
      // 更新缓存
      for (const [key, value] of Object.entries(keyValuePairs)) {
        this.#setToCache(key, value);
      }
    } catch (error) {
      logError('批量保存数据失败', error, 'StorageService.batchSet');
      throw error;
    }
  }

  /**
   * 清除所有数据
   * @returns {Promise<void>}
   */
  static async clearAll() {
    try {
      await clearAllData();
      this.#clearCache();
    } catch (error) {
      logError('清除所有数据失败', error, 'StorageService.clearAll');
      throw error;
    }
  }

  // 登录用户相关操作
  /**
   * 保存登录用户信息
   * @param {Object} user - 用户信息
   * @returns {Promise<void>}
   */
  static async saveLoggedInUser(user) {
    try {
      await saveData('loggedInUser', user);
      this.#setToCache('loggedInUser', user);
    } catch (error) {
      logError('保存登录用户信息失败', error, 'StorageService.saveLoggedInUser');
      throw error;
    }
  }

  /**
   * 获取登录用户信息
   * @returns {Promise<Object|null>} 用户信息
   */
  static async getLoggedInUser() {
    try {
      const cached = this.#getFromCache('loggedInUser');
      if (cached) return cached;
      
      const user = await getData('loggedInUser', null);
      this.#setToCache('loggedInUser', user);
      return user;
    } catch (error) {
      logError('获取登录用户信息失败', error, 'StorageService.getLoggedInUser');
      return null;
    }
  }

  /**
   * 移除登录用户信息
   * @returns {Promise<void>}
   */
  static async removeLoggedInUser() {
    try {
      await removeData('loggedInUser');
      this.#clearCache('loggedInUser');
    } catch (error) {
      logError('移除登录用户信息失败', error, 'StorageService.removeLoggedInUser');
      throw error;
    }
  }

  // BOM相关操作
  /**
   * 获取所有BOM数据
   * @returns {Promise<Array>} BOM数据数组
   */
  static async getBOMs() {
    try {
      const cached = this.#getFromCache('boms');
      if (cached) return cached;
      
      const boms = await getData('boms', []);
      this.#setToCache('boms', boms);
      return boms;
    } catch (error) {
      logError('获取BOM数据失败', error, 'StorageService.getBOMs');
      return [];
    }
  }

  /**
   * 保存BOM数据
   * @param {Array} boms - BOM数据数组
   * @returns {Promise<void>}
   */
  static async saveBOMs(boms) {
    try {
      await saveData('boms', boms);
      this.#setToCache('boms', boms);
    } catch (error) {
      logError('保存BOM数据失败', error, 'StorageService.saveBOMs');
      throw error;
    }
  }

  /**
   * 添加新BOM
   * @param {Object} bom - BOM数据
   * @returns {Promise<Object>} 添加的BOM数据
   */
  static async addBOM(bom) {
    try {
      const boms = await this.getBOMs();
      const newBOM = {
        ...bom,
        id: boms.length > 0 ? Math.max(...boms.map(b => b.id)) + 1 : 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      boms.push(newBOM);
      await this.saveBOMs(boms);
      return newBOM;
    } catch (error) {
      logError('添加BOM失败', error, 'StorageService.addBOM');
      throw error;
    }
  }

  /**
   * 更新BOM数据
   * @param {Object} updatedBOM - 更新后的BOM数据
   * @returns {Promise<boolean>} 是否更新成功
   */
  static async updateBOM(updatedBOM) {
    try {
      const boms = await this.getBOMs();
      const index = boms.findIndex(b => b.id === updatedBOM.id);
      if (index !== -1) {
        boms[index] = {
          ...updatedBOM,
          updatedAt: new Date().toISOString()
        };
        await this.saveBOMs(boms);
        return true;
      }
      return false;
    } catch (error) {
      logError('更新BOM失败', error, 'StorageService.updateBOM');
      throw error;
    }
  }

  /**
   * 删除BOM
   * @param {number} bomId - BOM ID
   * @returns {Promise<boolean>} 是否删除成功
   */
  static async deleteBOM(bomId) {
    try {
      const boms = await this.getBOMs();
      const updatedBoms = boms.filter(b => b.id !== bomId);
      await this.saveBOMs(updatedBoms);
      return true;
    } catch (error) {
      logError('删除BOM失败', error, 'StorageService.deleteBOM');
      throw error;
    }
  }

  /**
   * 根据ID获取BOM
   * @param {number} bomId - BOM ID
   * @returns {Promise<Object|null>} BOM数据
   */
  static async getBOMById(bomId) {
    try {
      const boms = await this.getBOMs();
      return boms.find(b => b.id === bomId) || null;
    } catch (error) {
      logError('根据ID获取BOM失败', error, 'StorageService.getBOMById');
      return null;
    }
  }

  // 数据备份和恢复
  static async exportAllData() {
    try {
      const keys = ['devices', 'users', 'boms', 'searchHistory', 'formState'];
      const data = await this.batchGet(keys);
      return {
        data,
        exportDate: new Date().toISOString(),
        version: '1.0.0',
        appVersion: '1.0.0'
      };
    } catch (error) {
      logError('导出数据失败', error, 'StorageService.exportAllData');
      throw error;
    }
  }

  static async importAllData(backupData) {
    try {
      if (!backupData || !backupData.data) {
        throw new Error('无效的备份数据');
      }
      
      // 验证备份数据版本
      const version = backupData.version || '1.0.0';
      if (version !== '1.0.0') {
        throw new Error('备份数据版本不兼容');
      }
      
      // 批量保存数据
      await this.batchSet(backupData.data);
      return true;
    } catch (error) {
      logError('导入数据失败', error, 'StorageService.importAllData');
      throw error;
    }
  }

  // 批量导入器件数据
  static async importDevicesFromCSV(csvContent) {
    try {
      const devices = await this.getDevices();
      const newDevices = [];
      const errors = [];
      
      // 中文列名映射
      const columnMapping = {
        '器件名称': 'name',
        '名称': 'name',
        '器件编号': 'id',
        '编号': 'id',
        '供应商编号': 'supplierId',
        '封装': 'package',
        '位号': 'position',
        '备注': 'remark',
        '值': 'value',
        '数量': 'quantity',
        '型号': 'model',
        '功能': 'function',
        '分类': 'category',
        '类别': 'category'
      };
      
      // 解析CSV内容
      const lines = csvContent.split('\n');
      const headers = parseCSVLine(lines[0]).map(header => header.trim());
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = parseCSVLine(line);
        const device = {};
        
        headers.forEach((header, index) => {
          let mappedField = header.toLowerCase();
          
          for (const [chineseName, englishName] of Object.entries(columnMapping)) {
            if (header.includes(chineseName) || header.toLowerCase() === chineseName.toLowerCase()) {
              mappedField = englishName;
              break;
            }
          }
          
          device[mappedField] = (values[index] || '').trim();
        });
        
        // 验证必要字段
        if (!device.name && !device['器件名称']) {
          errors.push(`第 ${i+1} 行: 器件名称不能为空`);
          continue;
        }
        
        // 如果name为空但有中文名称，使用中文名称
        if (!device.name && device['器件名称']) {
          device.name = device['器件名称'];
        }
        
        // 如果没有指定器件编号，使用供应商编号作为器件编号
        if (!device.id && device.supplierId) {
          device.id = device.supplierId;
        }
        
        // 如果没有设置supplierId，但有id，将id也赋值给supplierId（用于显示）
        if (!device.supplierId && device.id) {
          device.supplierId = device.id;
        }
        
        // 如果指定了编号，检查是否为数字
        if (device.id && isNaN(parseInt(device.id))) {
          // 如果不是数字，作为字符串ID使用
        }
        
        // 自动根据"值"字段填入对应的电气参数字段
        if (device.value) {
          const value = device.value.trim();
          
          if (value.includes('Ω')) {
            device.resistance = value;
          } else if (value.includes('F') && !value.includes('H')) {
            device.capacitance = value;
          } else if (value.includes('H') && (value.includes('mH') || value.includes('μH') || value.includes('nH'))) {
            device.inductance = value;
          } else if (value.includes('V')) {
            device.voltage = value;
          } else if (value.includes('A')) {
            device.current = value;
          } else if (value.includes('W')) {
            device.power = value;
          } else if (value.includes('Hz')) {
            device.frequency = value;
          }
        }
        
        // 处理其他字段
        if (device.shelfid) device.shelfId = device.shelfid;
        
        // 移除不需要的字段
        delete device.shelfid;
        
        newDevices.push(device);
      }
      
      // 添加新器件
      for (const device of newDevices) {
        await this.addDevice(device);
      }
      
      return { success: true, imported: newDevices.length, errors, total: newDevices.length + errors.length };
    } catch (error) {
      logError('批量导入器件失败', error, 'StorageService.importDevicesFromCSV');
      throw error;
    }
  }

  // 搜索和过滤
  /**
   * 搜索器件
   * @param {string} keyword - 搜索关键词
   * @returns {Promise<Array>} 搜索结果
   */
  static async searchDevices(keyword) {
    try {
      const devices = await this.getDevices();
      const searchTerm = keyword.toLowerCase().trim();
      
      if (!searchTerm) return devices;
      
      return devices.filter(device => {
        return (
          (device.name && device.name.toLowerCase().includes(searchTerm)) ||
          (device.id && device.id.toString().includes(searchTerm)) ||
          (device.function && device.function.toLowerCase().includes(searchTerm)) ||
          (device.resistance && device.resistance.toLowerCase().includes(searchTerm)) ||
          (device.voltage && device.voltage.toLowerCase().includes(searchTerm)) ||
          (device.capacitance && device.capacitance.toLowerCase().includes(searchTerm)) ||
          (device.inductance && device.inductance.toLowerCase().includes(searchTerm)) ||
          (device.current && device.current.toLowerCase().includes(searchTerm))
        );
      });
    } catch (error) {
      logError('搜索器件失败', error, 'StorageService.searchDevices');
      return [];
    }
  }

  /**
   * 过滤器件
   * @param {Object} filters - 过滤条件
   * @returns {Promise<Array>} 过滤结果
   */
  static async filterDevices(filters) {
    try {
      const devices = await this.getDevices();
      
      return devices.filter(device => {
        for (const [key, value] of Object.entries(filters)) {
          if (value === null || value === undefined || value === '') continue;
          
          const deviceValue = device[key];
          if (!deviceValue) return false;
          
          if (typeof value === 'string') {
            if (!deviceValue.toString().toLowerCase().includes(value.toLowerCase())) {
              return false;
            }
          } else if (typeof value === 'number') {
            if (deviceValue !== value) {
              return false;
            }
          }
        }
        return true;
      });
    } catch (error) {
      logError('过滤器件失败', error, 'StorageService.filterDevices');
      return [];
    }
  }
}

export default StorageService;
