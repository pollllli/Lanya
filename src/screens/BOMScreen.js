/**
 * BOM配单屏幕
 * 用于创建、编辑和管理BOM（Bill of Materials）配单
 * 支持从器件库选择组件，保存和加载BOM配单
 */
import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Modal, FlatList } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import StorageService from '../services/StorageService';
import { logError, formatErrorMessage } from '../utils/ErrorHandler';

/**
 * BOM配单屏幕组件
 * @param {Object} props - 组件属性
 * @param {Object} props.navigation - 导航对象
 * @param {boolean} props.isAdmin - 是否为管理员用户
 */

const BOMScreen = ({ navigation, isAdmin = false }) => {
  console.log('BOMScreen received isAdmin:', isAdmin);
  // 确保isAdmin是布尔值
  const isAdminUser = Boolean(isAdmin);
  const [components, setComponents] = useState([]);
  const [devices, setDevices] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredComponents, setFilteredComponents] = useState([]);
  const [isImporting, setIsImporting] = useState(false);

  // 加载器件库
  useEffect(() => {
    loadDevices();
  }, []);

  // 当组件列表或搜索查询变化时，更新过滤后的组件列表
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredComponents(components);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = components.filter(component => 
        component.name.toLowerCase().includes(query)
      );
      setFilteredComponents(filtered);
    }
  }, [components, searchQuery]);



  /**
   * 加载器件库数据
   * 如果器件库为空，使用默认数据初始化
   */
  const loadDevices = async () => {
    try {
      // 先尝试从存储中读取数据
      let savedDevices = await StorageService.getDevices();
      
      // 如果器件库为空，使用默认数据
      if (savedDevices.length === 0) {
        const defaultDevices = [
          { id: 1, name: '10Ω电阻器', function: '限流、分压', resistance: '10Ω', voltage: '5V', shelfId: '1' },
          { id: 2, name: '10μF电容器', function: '储能、滤波', capacitance: '10μF', voltage: '16V', shelfId: '1' },
          { id: 3, name: '10mH电感器', function: '储能、滤波', inductance: '10mH', current: '1A', shelfId: '1' },
          { id: 4, name: '1N4007二极管', function: '单向导电', voltage: '1000V', current: '2A', shelfId: '1' },
          { id: 5, name: '2N2222三极管', function: '放大、开关', voltage: '40V', current: '500mA', shelfId: '2' },
          { id: 6, name: '74HC00集成电路', function: '信号处理', voltage: '3.3V', current: '100mA', shelfId: '2' },
          { id: 7, name: '5V继电器', function: '电气控制', voltage: '5V', current: '10A', shelfId: '2' },
          { id: 8, name: '单极开关', function: '电路控制', voltage: '250V', current: '16A', shelfId: '2' },
          { id: 9, name: '5A保险丝', function: '过载保护', voltage: '250V', current: '5A', shelfId: '3' },
          { id: 10, name: '10kΩ电位器', function: '调节电阻', resistance: '10kΩ', voltage: '25V', shelfId: '3' },
          { id: 11, name: '220V/12V变压器', function: '电压转换', voltage: '220V/12V', current: '2A', shelfId: '3' },
          { id: 12, name: '16MHz晶振', function: '时钟信号', frequency: '16MHz', voltage: '3.3V', shelfId: '3' },
          { id: 13, name: '红色LED', function: '发光指示', voltage: '3.3V', current: '20mA', shelfId: '4' },
          { id: 14, name: '5V蜂鸣器', function: '声音提示', voltage: '5V', current: '100mA', shelfId: '4' },
          { id: 15, name: '温度传感器', function: '信号检测', voltage: '5V', current: '50mA', shelfId: '4' },
        ];
        await StorageService.saveDevices(defaultDevices);
        savedDevices = defaultDevices;
      }
      
      setDevices(savedDevices);
    } catch (error) {
      logError('加载器件失败', error, 'BOMScreen.loadDevices');
    }
  };

  // 处理BOM文件上传
  const handleImportBOM = async () => {
    try {
      setIsImporting(true);
      
      // 选择文件
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setIsImporting(false);
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name;
      
      // 检查文件类型
      if (fileName.endsWith('.csv')) {
        // 处理CSV文件
        try {
          // 读取CSV文件内容
          const fileContent = await FileSystem.readAsStringAsync(fileUri);
          parseBOMData(fileContent, 'csv');
        } catch (error) {
          logError('处理CSV文件失败', error, 'BOMScreen.handleImportBOM');
          Alert.alert('错误', `处理CSV文件失败: ${error.message || '请检查文件格式'}`);
        }
      } else {
        // 处理Excel文件
        try {
          // 复制文件到缓存目录
          const cacheDir = FileSystem.cacheDirectory;
          const localUri = cacheDir + fileName;
          
          await FileSystem.copyAsync({
            from: fileUri,
            to: localUri
          });
          
          // 读取文件内容
          const fileContent = await FileSystem.readAsStringAsync(localUri, {
            encoding: 'base64'
          });
          
          // 解码base64并解析
          const binaryString = atob(fileContent);
          const workbook = XLSX.read(binaryString, { type: 'binary' });
          const sheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[sheetName];
          const csvContent = XLSX.utils.sheet_to_csv(worksheet);
          parseBOMData(csvContent, 'csv');
        } catch (error) {
          logError('处理Excel文件失败', error, 'BOMScreen.handleImportBOM');
          Alert.alert('错误', `处理Excel文件失败: ${error.message || '请检查文件格式'}`);
        }
      }
    } catch (error) {
      logError('导入BOM失败', error, 'BOMScreen.handleImportBOM');
      Alert.alert('错误', `导入BOM失败: ${error.message || '请重试'}`);
    } finally {
      setIsImporting(false);
    }
  };

  // 解析BOM数据
  const parseBOMData = (csvContent, type) => {
    try {
      // 使用XLSX库解析CSV内容，正确处理包含逗号的单元格
      const workbook = XLSX.read(csvContent, { type: 'string' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
      
      const bomComponents = [];
      
      // 从第二行开始解析（跳过表头）
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.length === 0) continue;
        
        // 直接按列索引提取数据：C列（索引2）是封装，F列（索引5）是供应商编号
        const packageType = row[2] ? String(row[2]).trim() : '';
        const supplierId = row[5] ? String(row[5]).trim() : '';
        const quantity = parseInt(row[6] ? String(row[6]).trim() : '1');
        const description = row[4] ? String(row[4]).trim() : '';
        
        // 构建组件名称（使用供应商编号和封装）
        let componentName = '';
        if (supplierId) componentName += supplierId + ' ';
        if (packageType) componentName += packageType + ' ';
        if (description) componentName += '(' + description + ')';
        
        if (componentName) {
          bomComponents.push({
            name: componentName.trim(),
            quantity: isNaN(quantity) ? 1 : quantity,
            supplierId: supplierId,
            package: packageType,
            description: description
          });
        }
      }
      
      if (bomComponents.length > 0) {
        // 按供应商编号排序，如果没有供应商编号则按名称排序
        const sortedComponents = bomComponents.sort((a, b) => {
          if (a.supplierId && b.supplierId) {
            return a.supplierId.localeCompare(b.supplierId);
          } else if (a.supplierId) {
            return -1;
          } else if (b.supplierId) {
            return 1;
          } else {
            return a.name.localeCompare(b.name);
          }
        });
        setComponents(sortedComponents);
        Alert.alert('成功', `成功解析 ${sortedComponents.length} 个器件`);
      } else {
        Alert.alert('错误', '未找到有效的器件数据');
      }
    } catch (error) {
      logError('解析BOM数据失败', error, 'BOMScreen.parseBOMData');
      Alert.alert('错误', '解析BOM数据失败，请检查文件格式');
    }
  };

  // 检查器件是否在器件架中
  const isDeviceInShelf = (component) => {
    if (!component.supplierId) return false;
    return devices.some(device => 
      (device.supplierId === component.supplierId || device.id.toString() === component.supplierId) &&
      (!component.package || device.package === component.package)
    );
  };

  // 处理器件点击，控制灯的状态
  const handleComponentPress = async (component) => {
    // 检查是否有蓝牙连接
    if (!global.deviceConnection) {
      Alert.alert('提示', '请先在连接页面连接蓝牙设备');
      return;
    }

    // 只有在器件架中的器件才亮灯
    if (isDeviceInShelf(component)) {
      const device = devices.find(d => d.supplierId === component.supplierId || d.id.toString() === component.supplierId);
      if (device) {
        try {
          const { handler } = global.deviceConnection;
          const response = await handler.sendCommand({
            type: 'requestDevice',
            deviceId: device.id
          });
          if (response.success) {
            Alert.alert('成功', `已请求器件: ${component.name}\n对应位置灯已亮起`);
          } else {
            Alert.alert('错误', `请求器件失败: ${response.message}`);
          }
        } catch (error) {
          Alert.alert('错误', '发送命令失败，请检查设备连接');
        }
      }
    } else {
      // 不在器件架中的器件，不做任何操作
      console.log('器件不在器件架中，不执行亮灯操作');
    }
  };



  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>BOM 配单</Text>
      </View>
      
      <ScrollView style={styles.content}>
        
        <View style={styles.componentsList}>
          <Text style={styles.label}>组件列表</Text>
          <View style={styles.searchInputContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="搜索组件..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
          </View>
          {filteredComponents.length > 0 ? (
            filteredComponents.map((component, index) => {
              const inShelf = isDeviceInShelf(component);
              return (
                <TouchableOpacity 
                  key={index} 
                  style={[styles.componentItem, { backgroundColor: inShelf ? '#e8f5e8' : '#fff3e0' }]}
                  onPress={() => handleComponentPress(component)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.componentText, { color: inShelf ? '#2e7d32' : '#ef6c00' }]}>{component.name}</Text>
                    <Text style={styles.componentQuantity}>数量: {component.quantity}</Text>
                    {component.supplierId && (
                      <Text style={styles.supplierId}>编号: {component.supplierId}</Text>
                    )}
                    <Text style={[styles.statusText, { color: inShelf ? '#2e7d32' : '#ef6c00' }]}>
                      {inShelf ? '✓ 在器件架中' : '✗ 不在器件架中'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })
          ) : (
            <Text style={styles.emptyText}>
              {searchQuery.trim() ? '未找到匹配的组件' : (isAdminUser ? '暂无组件，请添加' : '暂无组件')}
            </Text>
          )}
        </View>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={[styles.button, styles.importButton]} onPress={handleImportBOM} disabled={isImporting}>
            <Text style={styles.buttonText}>{isImporting ? '导入中...' : '导入 BOM 文件'}</Text>
          </TouchableOpacity>
        </View>
        

      </ScrollView>
      

      

      

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    backgroundColor: '#e0e0e0',
    padding: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  content: {
    flex: 1,
    padding: 16,
  },
  inputContainer: {
    marginBottom: 20,
  },
  label: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  addComponentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  componentInput: {
    flex: 1,
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginRight: 10,
  },
  addButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  componentsList: {
    marginBottom: 20,
  },
  componentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'white',
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    marginBottom: 8,
  },
  componentText: {
    fontSize: 16,
    fontWeight: '500',
  },
  componentQuantity: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  supplierId: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  removeButton: {
    color: '#FF3B30',
    fontWeight: 'bold',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    borderStyle: 'dashed',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  button: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  loadButton: {
    backgroundColor: '#007AFF',
  },
  importButton: {
    backgroundColor: '#ff9800',
  },
  saveButton: {
    backgroundColor: '#4caf50',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '90%',
    maxHeight: '90%',
    padding: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  closeButton: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  loadingText: {
    fontSize: 16,
    textAlign: 'center',
    padding: 20,
  },
  bomItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  bomInfo: {
    flex: 1,
  },
  bomName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  bomDetails: {
    fontSize: 12,
    color: '#666',
  },
  bomActions: {
    flexDirection: 'row',
  },
  actionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    marginLeft: 8,
  },
  deleteButton: {
    backgroundColor: '#FF3B30',
  },
  actionButtonText: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  deleteButtonText: {
    color: 'white',
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  batchDeviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  deviceDetails: {
    fontSize: 12,
    color: '#666',
  },
  selectButton: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
  // 批量选择相关样式



  // 搜索输入框样式
  searchInputContainer: {
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: 'white',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    fontSize: 16,
  },
});

export default BOMScreen;