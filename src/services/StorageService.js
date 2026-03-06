import { saveData, getData, removeData, batchGetData, batchSaveData, clearAllData } from '../utils/StorageUtils';
import { logError } from '../utils/ErrorHandler';

class StorageService {
  // 设备相关操作
  /**
   * 获取所有器件数据
   * @returns {Promise<Array>} 器件数据数组
   */
  static async getDevices() {
    try {
      return await getData('devices', []);
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
      
      // 检查编号唯一性
      if (device.id) {
        const existingDevice = devices.find(d => d.id === device.id);
        if (existingDevice) {
          throw new Error(`器件编号 ${device.id} 已存在`);
        }
      }
      
      // 自动生成编号
      const newDevice = {
        ...device,
        id: device.id || (devices.length > 0 ? Math.max(...devices.map(d => d.id)) + 1 : 1)
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
   * @returns {Promise<boolean>} 是否更新成功
   */
  static async updateDevice(updatedDevice) {
    try {
      const devices = await this.getDevices();
      const index = devices.findIndex(d => d.id === updatedDevice.id);
      if (index !== -1) {
        devices[index] = updatedDevice;
        await this.saveDevices(devices);
        return true;
      }
      return false;
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

  // 用户相关操作
  /**
   * 获取所有用户数据
   * @returns {Promise<Array>} 用户数据数组
   */
  static async getUsers() {
    try {
      const users = await getData('users');
      if (users) {
        return users;
      } else {
        // 默认用户
        const defaultUsers = [
          { username: 'admin', password: 'admin', isAdmin: true },
          { username: 'user', password: 'user', isAdmin: false }
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
    } catch (error) {
      logError('保存用户数据失败', error, 'StorageService.saveUsers');
      throw error;
    }
  }

  // 搜索历史相关操作
  /**
   * 获取搜索历史
   * @returns {Promise<Array>} 搜索历史数组
   */
  static async getSearchHistory() {
    try {
      return await getData('searchHistory', []);
    } catch (error) {
      logError('获取搜索历史失败', error, 'StorageService.getSearchHistory');
      return [];
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
      return await getData('formState', {});
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
      return await batchGetData(keys);
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
      return await getData('loggedInUser', null);
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
      return await getData('boms', []);
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
        createdAt: new Date().toISOString()
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

  // 数据备份和恢复
  static async exportAllData() {
    try {
      const keys = ['devices', 'users', 'boms', 'searchHistory', 'formState'];
      const data = await this.batchGet(keys);
      return {
        data,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
      };
    } catch (error) {
      console.error('导出数据失败:', error);
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
      console.error('导入数据失败:', error);
      throw error;
    }
  }

  // 批量导入器件数据
  static async importDevicesFromCSV(csvContent) {
    try {
      const devices = await this.getDevices();
      const newDevices = [];
      const errors = [];
      
      // 解析CSV内容
      const lines = csvContent.split('\n');
      const headers = lines[0].split(',').map(header => header.trim());
      
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(',');
        const device = {};
        
        headers.forEach((header, index) => {
          device[header.toLowerCase()] = values[index] ? values[index].trim() : '';
        });
        
        // 验证必要字段
        if (!device.name) {
          errors.push(`第 ${i+1} 行: 器件名称不能为空`);
          continue;
        }
        
        // 处理编号
        if (device.id) {
          device.id = parseInt(device.id);
          // 检查编号唯一性
          const existingDevice = devices.find(d => d.id === device.id);
          if (existingDevice) {
            errors.push(`第 ${i+1} 行: 器件编号 ${device.id} 已存在`);
            continue;
          }
        }
        
        // 处理其他字段
        if (device.resistance) device.resistance = device.resistance;
        if (device.voltage) device.voltage = device.voltage;
        if (device.capacitance) device.capacitance = device.capacitance;
        if (device.inductance) device.inductance = device.inductance;
        if (device.current) device.current = device.current;
        if (device.function) device.function = device.function;
        if (device.shelfid) device.shelfId = device.shelfid;
        
        newDevices.push(device);
      }
      
      // 添加新器件
      for (const device of newDevices) {
        await this.addDevice(device);
      }
      
      return { success: true, imported: newDevices.length, errors };
    } catch (error) {
      console.error('批量导入器件失败:', error);
      throw error;
    }
  }
}

export default StorageService;