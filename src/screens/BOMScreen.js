/**
 * BOM配单屏幕
 * 用于创建、编辑和管理BOM（Bill of Materials）配单
 * 支持从器件库选择组件，保存和加载BOM配单
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Modal,
  FlatList,
} from 'react-native';
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
    if (!searchQuery || searchQuery.trim() === '') {
      setFilteredComponents(components);
    } else {
      const query = searchQuery.toLowerCase();
      const filtered = components.filter(
        (component) =>
          component.name && component.name.toLowerCase().includes(query)
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

      // 保持器件架为空，让用户手动导入或添加器件

      setDevices(savedDevices);
    } catch (error) {
      logError('加载器件失败', error, 'BOMScreen.loadDevices');
    }
  };

  // 处理BOM文件上传
  const handleImportBOM = async () => {
    try {
      setIsImporting(true);

      // 选择文件（只支持Excel）
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        setIsImporting(false);
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileName = result.assets[0].name;

      // 先重新加载器件架数据，确保拿到最新的
      await loadDevices();

      // 处理Excel文件
      try {
        // 复制文件到缓存目录
        const cacheDir = FileSystem.cacheDirectory;
        const localUri = cacheDir + fileName;

        await FileSystem.copyAsync({
          from: fileUri,
          to: localUri,
        });

        // 读取文件内容
        const fileContent = await FileSystem.readAsStringAsync(localUri, {
          encoding: 'base64',
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
        Alert.alert(
          '错误',
          `处理Excel文件失败: ${error.message || '请检查文件格式'}`
        );
      }
    } catch (error) {
      logError('导入BOM失败', error, 'BOMScreen.handleImportBOM');
      Alert.alert('错误', `导入BOM失败: ${error.message || '请重试'}`);
    } finally {
      setIsImporting(false);
    }
  };

  // 解析BOM数据
  const parseBOMData = async (csvContent, type) => {
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

        // 按列索引提取数据：
        // A列(0): 序号, B列(1): 值, C列(2): 封装, D列(3): 位号
        // E列(4): 备注, F列(5): 供应商编号, G列(6): 数量
        // H列(7): 器件名称, I列(8): 类别
        const packageType = row[2] ? String(row[2]).trim() : '';
        const supplierId = row[5] ? String(row[5]).trim() : '';
        const quantity = parseInt(row[6] ? String(row[6]).trim() : '1');
        const description = row[4] ? String(row[4]).trim() : '';
        const deviceName = row[7] ? String(row[7]).trim() : '';
        const category = row[8] ? String(row[8]).trim() : '';

        // 构建组件名称（优先使用器件名称，其次使用供应商编号和封装）
        let componentName = '';
        if (deviceName) componentName += deviceName;
        else if (supplierId) componentName += supplierId;
        if (packageType && componentName) componentName += ' ' + packageType;
        if (description) componentName += ' (' + description + ')';

        if (componentName || supplierId) {
          bomComponents.push({
            name: componentName.trim() || supplierId,
            quantity: isNaN(quantity) ? 1 : quantity,
            supplierId: supplierId,
            package: packageType,
            description: description,
            deviceName: deviceName,
            category: category,
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
        
        // 计算匹配到的物理器件数量
        let matchedDeviceCount = 0;
        for (const component of sortedComponents) {
          const matchInfo = getDeviceMatchInfo(component);
          if (matchInfo.devices && matchInfo.devices.length > 0) {
            matchedDeviceCount += matchInfo.devices.length;
          }
        }
        
        Alert.alert(
          '成功',
          `成功导入 ${sortedComponents.length} 种器件，匹配到 ${matchedDeviceCount} 个物理器件`,
          [{ text: '确定', onPress: () => autoLightAllSufficientDevices(sortedComponents) }]
        );
      } else {
        Alert.alert('错误', '未找到有效的器件数据');
      }
    } catch (error) {
      logError('解析BOM数据失败', error, 'BOMScreen.parseBOMData');
      Alert.alert('错误', '解析BOM数据失败，请检查文件格式');
    }
  };

  // 更新器件架中对应器件的库存数量
  const updateDeviceQuantities = async (bomComponents) => {
    try {
      let updatedDevices = [...devices];
      let updatedCount = 0;
      
      console.log('=== 开始更新库存数量 ===');
      console.log('器件架中的器件数量:', updatedDevices.length);
      console.log('BOM组件数量:', bomComponents.length);
      
      // 打印所有器件架中的器件，便于调试
      console.log('\n器件架中的器件列表:');
      updatedDevices.forEach((device, idx) => {
        console.log(`${idx+1}. 名称: "${device.name}", 供应商编号: "${device.supplierId}", 当前库存: "${device.stock}", 封装: "${device.package}"`);
      });
      
      for (const component of bomComponents) {
        console.log('\n===============================');
        console.log('处理组件:');
        console.log('  名称:', component.name);
        console.log('  供应商编号:', component.supplierId || '(空)');
        console.log('  器件名称:', component.deviceName || '(空)');
        console.log('  封装:', component.package || '(空)');
        console.log('  需要数量:', component.quantity);
        
        let matched = false;
        let matchReason = '';
        
        const index = updatedDevices.findIndex((device) => {
          // 方式1: 通过供应商编号精确匹配
          if (component.supplierId && device.supplierId) {
            if (device.supplierId === component.supplierId) {
              matched = true;
              matchReason = '供应商编号精确匹配';
              return true;
            }
          }
          
          // 方式2: 通过器件名称精确匹配
          if (component.deviceName && device.name) {
            if (device.name === component.deviceName) {
              matched = true;
              matchReason = '器件名称精确匹配';
              return true;
            }
          }
          
          // 方式3: 通过器件名称包含匹配（忽略大小写）
          if (component.deviceName && device.name) {
            const deviceNameLower = device.name.toLowerCase();
            const componentNameLower = component.deviceName.toLowerCase();
            if (deviceNameLower.includes(componentNameLower) || componentNameLower.includes(deviceNameLower)) {
              matched = true;
              matchReason = '器件名称包含匹配';
              return true;
            }
          }
          
          // 方式4: 通过构建的组件名称匹配
          if (component.name && device.name) {
            const deviceNameLower = device.name.toLowerCase();
            const componentNameLower = component.name.toLowerCase().replace(/\s*\([^)]+\)\s*/g, '').trim();
            if (deviceNameLower.includes(componentNameLower) || componentNameLower.includes(deviceNameLower)) {
              matched = true;
              matchReason = '组件名称包含匹配';
              return true;
            }
          }
          
          // 方式5: 通过值字段匹配（B列的值）
          if (component.description && device.name) {
            const deviceNameLower = device.name.toLowerCase();
            const descLower = component.description.toLowerCase();
            if (deviceNameLower.includes(descLower) || descLower.includes(deviceNameLower)) {
              matched = true;
              matchReason = '描述/值字段匹配';
              return true;
            }
          }
          
          return false;
        });
        
        if (index !== -1) {
          const device = updatedDevices[index];
          const oldQuantity = device.quantity || 0;
          updatedDevices[index] = {
            ...device,
            quantity: component.quantity
          };
          console.log(`  ✅ 匹配成功! ${matchReason}`);
          console.log(`  器件: ${device.name}`);
          console.log(`  数量更新: ${oldQuantity} -> ${component.quantity}`);
          updatedCount++;
        } else {
          console.log(`  ❌ 未找到匹配的器件`);
        }
      }
      
      // 保存更新后的器件数据
      await StorageService.saveDevices(updatedDevices);
      // 更新本地状态
      setDevices(updatedDevices);
      
      console.log(`\n=== 更新完成 ===`);
      console.log(`更新了 ${updatedCount} 个器件的库存`);
      console.log(`未匹配 ${bomComponents.length - updatedCount} 个组件`);
    } catch (error) {
      logError('更新器件库存数量失败', error, 'BOMScreen.updateDeviceQuantities');
    }
  };

  // 获取器件匹配信息（包括数量检查）
  const getDeviceMatchInfo = (component) => {
    console.log(`\n=== getDeviceMatchInfo 开始 ===`);
    console.log(`组件名称: ${component.name}`);
    console.log(`组件供应商编号: ${component.supplierId}`);
    console.log(`组件器件名称: ${component.deviceName}`);
    console.log(`组件封装: ${component.package}`);
    
    // 封装匹配辅助函数（处理前导零差异）
    const checkPackageMatch = (devicePackage, componentPackage) => {
      if (!componentPackage || !devicePackage) return true;
      // 去除前导零后比较
      const normalizedDevicePackage = devicePackage.replace(/^0+/, '');
      const normalizedComponentPackage = componentPackage.replace(/^0+/, '');
      return normalizedDevicePackage === normalizedComponentPackage || 
             devicePackage === componentPackage;
    };
    
    // 查找匹配的器件（必须同时满足供应商编号和器件名称匹配）
    const matchedDevices = devices.filter((device, index) => {
      console.log(`\n检查器件[${index}]: ${device.name}`);
      console.log(`  器件供应商编号: ${device.supplierId}`);
      console.log(`  器件封装: ${device.package}`);
      
      // 方式1: 同时满足供应商编号和器件名称匹配（最高优先级）
      if (component.supplierId && device.supplierId && component.deviceName && device.name) {
        const supplierMatch = device.supplierId === component.supplierId;
        const nameMatch = device.name === component.deviceName;
        console.log(`  供应商编号匹配: ${supplierMatch}, 器件名称匹配: ${nameMatch}`);
        if (supplierMatch && nameMatch) {
          const packageMatch = checkPackageMatch(device.package, component.package);
          console.log(`  封装匹配: ${packageMatch}`);
          if (packageMatch) return true;
        }
      }
      
      // 方式2: 仅按供应商编号精确匹配（当没有器件名称时）
      if (component.supplierId && device.supplierId && !component.deviceName) {
        if (device.supplierId === component.supplierId) {
          const packageMatch = checkPackageMatch(device.package, component.package);
          console.log(`  仅供应商编号匹配: true, 封装匹配: ${packageMatch}`);
          if (packageMatch) return true;
        }
      }
      
      // 方式3: 仅按器件名称精确匹配（当没有供应商编号时）
      if (component.deviceName && device.name && !component.supplierId) {
        if (device.name === component.deviceName) {
          const packageMatch = checkPackageMatch(device.package, component.package);
          console.log(`  仅器件名称匹配: true, 封装匹配: ${packageMatch}`);
          if (packageMatch) return true;
        }
      }
      
      return false;
    });
    
    // 如果找到匹配的器件
    if (matchedDevices.length > 0) {
      // 计算器件架中的总数量
      const totalInShelf = matchedDevices.reduce((sum, device) => {
        const deviceQuantity = device.quantity ? parseInt(device.quantity) : 1;
        return sum + (isNaN(deviceQuantity) ? 1 : deviceQuantity);
      }, 0);
      
      return {
        exists: true,
        totalInShelf: totalInShelf,
        sufficient: totalInShelf >= component.quantity,
        devices: matchedDevices,
        matchedCount: matchedDevices.length
      };
    }
    
    return {
      exists: false,
      totalInShelf: 0,
      sufficient: false,
      devices: [],
      matchedCount: 0
    };
  };

  // 检查器件是否在器件架中（包括数量检查）- 保持向后兼容
  const isDeviceInShelf = (component) => {
    const matchInfo = getDeviceMatchInfo(component);
    return matchInfo.exists && matchInfo.sufficient;
  };

  // 处理器件点击，控制灯的状态（取出器件）
  const handleComponentPress = async (component, device = null) => {
    // 检查是否有蓝牙连接
    if (!global.deviceConnection) {
      Alert.alert('提示', '请先在连接页面连接蓝牙设备');
      return;
    }

    // 如果没有传入具体的器件，需要查找匹配的器件
    let targetDevice = device;
    if (!targetDevice) {
      // 获取器件匹配信息
      const matchInfo = getDeviceMatchInfo(component);

      // 只有数量足够的器件才能取出
      if (!matchInfo.exists || !matchInfo.sufficient) {
        if (matchInfo.exists && !matchInfo.sufficient) {
          Alert.alert(
            '提示',
            `器件数量不足！\n需要: ${component.quantity}\n现有: ${matchInfo.totalInShelf}`
          );
        } else {
          Alert.alert('提示', '器件不在器件架中，无法取出');
        }
        return;
      }

      // 使用第一个匹配到的设备
      if (matchInfo.devices && matchInfo.devices.length > 0) {
        targetDevice = matchInfo.devices[0];
      }
    } else {
      // 如果传入了device，也要检查数量是否充足
      const deviceQuantity = targetDevice.quantity ? parseInt(targetDevice.quantity) : 1;
      if (deviceQuantity < component.quantity) {
        Alert.alert(
          '提示',
          `器件数量不足！\n需要: ${component.quantity}\n现有: ${deviceQuantity}`
        );
        return;
      }
    }

    if (targetDevice) {
      try {
        // 使用数组索引作为硬件位置（从1开始）
        const index = devices.findIndex((d) => d.id === targetDevice.id);
        const hardwarePosition = index + 1;
        const { handler } = global.deviceConnection;
        const response = await handler.sendCommand({
          type: 'lightOff',
          lightId: hardwarePosition,
        });

        if (response.success) {
          Alert.alert(
            '成功',
            `已取出器件: ${component.name}\n对应位置灯已熄灭`
          );
        } else {
          Alert.alert('错误', `取出器件失败: ${response.message}`);
        }
      } catch (error) {
        Alert.alert('错误', '发送命令失败，请检查设备连接');
      }
    } else {
      Alert.alert('错误', '未找到对应的器件');
    }
  };

  // 自动点亮所有数量充足的器件灯
  const autoLightAllSufficientDevices = async (importedComponents = components) => {
    console.log('=== autoLightAllSufficientDevices 开始 ===');
    
    // 检查蓝牙连接
    if (!global.deviceConnection) {
      console.log('❌ 未连接蓝牙设备，跳过自动点亮');
      Alert.alert('提示', '请先在连接页面连接蓝牙设备');
      return;
    }
    
    console.log('✅ 蓝牙设备已连接');
    console.log(`📦 导入的组件数量: ${importedComponents.length}`);
    console.log(`📦 器件架中的器件数量: ${devices.length}`);
    
    // 打印所有器件信息
    console.log('=== 器件架中的所有器件 ===');
    devices.forEach((d, index) => {
      console.log(`索引: ${index}, ID: ${d.id}, 名称: ${d.name}, 供应商编号: ${d.supplierId}, 位置: ${d.position}`);
    });

    // 收集所有需要点亮的器件（包括重复匹配的器件，因为它们的id不同，指令帧也不同）
    const devicesToLight = [];
    
    for (const component of importedComponents) {
      const matchInfo = getDeviceMatchInfo(component);
      if (matchInfo.devices && matchInfo.devices.length > 0 && matchInfo.sufficient) {
        // 将所有匹配到的器件添加到列表中
        matchInfo.devices.forEach(device => {
          // 检查该器件是否已经在列表中（避免重复点亮同一个物理器件）
          const alreadyExists = devicesToLight.some(d => d.id === device.id);
          if (!alreadyExists) {
            devicesToLight.push({ device, component });
            console.log(`添加待点亮器件: ${device.name}, ID: ${device.id}`);
          }
        });
      }
    }

    console.log(`⭐ 待点亮的器件数量: ${devicesToLight.length}`);

    if (devicesToLight.length === 0) {
      console.log('❌ 没有数量充足的器件');
      Alert.alert('提示', '没有数量充足的器件可以点亮');
      return;
    }

    // 遍历点亮所有器件
    let successCount = 0;
    let failCount = 0;
    
    for (const { device, component } of devicesToLight) {
      console.log(`\n处理器件: ${device.name}`);
      console.log(`组件名称: ${component.name}`);
      console.log(`器件ID: ${device.id}, 器件位置: ${device.position}`);
      
      // 使用器件在数组中的索引作为硬件位置（从1开始）
      const index = devices.findIndex((d) => d.id === device.id);
      const hardwarePosition = index + 1;
      console.log(`器件在数组中的索引: ${index}, 计算的硬件位置: ${hardwarePosition}`);
      
      try {
        const { handler } = global.deviceConnection;
        console.log('📤 发送点亮指令...');
        const response = await handler.sendCommand({
          type: 'lightOn',
          lightId: hardwarePosition,
        });
        
        if (response && response.success) {
          console.log(`✅ 指令发送成功`);
          successCount++;
        } else {
          console.log(`❌ 指令发送失败: ${response?.message || '未知错误'}`);
          failCount++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`❌ 发送指令异常:`, error);
        failCount++;
      }
    }

    // 显示结果
    if (successCount > 0) {
      Alert.alert(
        '成功',
        `已成功点亮 ${successCount} 个器件灯${failCount > 0 ? `，${failCount} 个失败` : ''}`
      );
    } else {
      Alert.alert('提示', '未能点亮任何器件灯，请检查蓝牙连接和器件匹配');
    }
    
    console.log(`=== 自动点亮完成 === 成功: ${successCount}, 失败: ${failCount}`);
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
            filteredComponents.map((component, compIndex) => {
              const matchInfo = getDeviceMatchInfo(component);
              // 如果有多个匹配的器件，每个都单独显示（因为它们的id不同，指令帧也不同）
              if (matchInfo.devices && matchInfo.devices.length > 0) {
                return matchInfo.devices.map((device, deviceIndex) => {
                  const deviceQuantity = device.quantity ? parseInt(device.quantity) : 1;
                  const isSufficient = deviceQuantity >= component.quantity;
                  let bgColor, textColor, statusText;
                  if (!isSufficient) {
                    bgColor = '#fff3e0'; // 黄色 - 数量不足
                    textColor = '#ef6c00';
                    statusText = `⚠ 数量不足 (需${component.quantity}/现${deviceQuantity})`;
                  } else {
                    bgColor = '#e8f5e8'; // 绿色 - 数量足够
                    textColor = '#2e7d32';
                    statusText = `✓ 数量充足 (现${deviceQuantity})`;
                  }
                  
                  return (
                    <TouchableOpacity
                      key={`${compIndex}-${deviceIndex}-${device.id}`}
                      style={[
                        styles.componentItem,
                        { backgroundColor: bgColor },
                      ]}
                      onPress={() => handleComponentPress(component, device)}
                      activeOpacity={1}
                    >
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.componentText,
                            { color: textColor },
                          ]}
                        >
                          {component.name}
                        </Text>
                        <Text style={styles.componentQuantity}>
                          需要数量: {component.quantity}
                        </Text>
                        {component.supplierId && (
                          <Text style={styles.supplierId}>
                            编号: {component.supplierId}
                          </Text>
                        )}
                        <Text style={styles.deviceInfo}>
                          器件位置: {device.position || `位置 ${deviceIndex + 1}`}
                        </Text>
                        <Text
                          style={[
                            styles.statusText,
                            { color: textColor },
                          ]}
                        >
                          {statusText}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                });
              } else {
                // 没有匹配的器件
                return (
                  <View
                    key={compIndex}
                    style={[
                      styles.componentItem,
                      { backgroundColor: '#f5f5f5' },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.componentText,
                          { color: '#757575' },
                        ]}
                      >
                        {component.name}
                      </Text>
                      <Text style={styles.componentQuantity}>
                        需要数量: {component.quantity}
                      </Text>
                      {component.supplierId && (
                        <Text style={styles.supplierId}>
                          编号: {component.supplierId}
                        </Text>
                      )}
                      <Text style={[styles.statusText, { color: '#757575' }]}>
                        ✗ 不在器件架中
                      </Text>
                    </View>
                  </View>
                );
              }
            })
          ) : (
            <Text style={styles.emptyText}>
              {searchQuery.trim()
                ? '未找到匹配的组件'
                : isAdminUser
                  ? '暂无组件，请添加'
                  : '暂无组件'}
            </Text>
          )}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.button, styles.importButton]}
            onPress={handleImportBOM}
            disabled={isImporting}
          >
            <Text style={styles.buttonText}>
              {isImporting ? '导入中...' : '导入 BOM 文件'}
            </Text>
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
  deviceInfo: {
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
