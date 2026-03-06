import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import CommandBuilder from '../services/CommandBuilder';

const DeviceDetailScreen = ({ navigation, route }) => {
  const { device, isAdmin } = route.params || { device: {}, isAdmin: false };
  const [isSending, setIsSending] = useState(false);

  // 发送请求器件命令
  const handleSendCommand = async () => {
    // 检查是否有蓝牙连接
    if (!global.deviceConnection) {
      Alert.alert('提示', '请先在连接页面连接蓝牙设备');
      return;
    }

    setIsSending(true);
    try {
      // 使用全局蓝牙连接发送命令
      const { handler } = global.deviceConnection;
      
      // 发送请求器件命令
      const response = await handler.sendCommand({
        type: 'requestDevice',
        deviceId: device.id
      });
      
      // 构建命令帧用于显示
      const commandBuilder = new CommandBuilder();
      const commandFrame = commandBuilder.buildRequestDeviceCommand(device.id);
      const commandFrameHex = commandFrame.map(byte => byte.toString(16).padStart(2, '0')).join(' ');
      
      // 构建响应帧用于显示
      let responseFrame = [];
      if (response && response.cmd) {
        responseFrame = [0x55, 0xAA, response.cmd, 1, 0x01];
        const responseCrc = commandBuilder.calculateCRC8(responseFrame);
        responseFrame.push(responseCrc);
      } else if (response && response.success) {
        // 如果响应没有cmd但有success字段
        responseFrame = [0x55, 0xAA, 0x81, 1, 0x01];
        const responseCrc = commandBuilder.calculateCRC8(responseFrame);
        responseFrame.push(responseCrc);
      }
      const responseFrameHex = responseFrame.map(byte => byte.toString(16).padStart(2, '0')).join(' ');
      
      Alert.alert(
        '指令发送成功',
        `已向下位机发送指令，请求编号为 ${device.id} 的器件\n对应位置灯已亮起\n\n发送帧: ${commandFrameHex}\n\n响应帧: ${responseFrameHex}`,
        [{ text: '确定' }]
      );
    } catch (error) {
      console.error('发送指令失败:', error);
      Alert.alert('错误', `发送指令失败: ${error.message || '未知错误'}`);
    } finally {
      setIsSending(false);
    }
  };

  // 发送取出器件命令
  const handleTakeOutDevice = async () => {
    // 检查是否有蓝牙连接
    if (!global.deviceConnection) {
      Alert.alert('提示', '请先在连接页面连接蓝牙设备');
      return;
    }

    setIsSending(true);
    try {
      // 使用全局蓝牙连接发送命令
      const { handler } = global.deviceConnection;
      
      // 发送熄灭对应灯的命令
      const response = await handler.sendCommand({
        type: 'lightOff',
        lightId: device.id
      });
      
      // 构建命令帧用于显示
      const commandBuilder = new CommandBuilder();
      const commandFrame = commandBuilder.buildLightOffCommand(device.id);
      const commandFrameHex = commandFrame.map(byte => byte.toString(16).padStart(2, '0')).join(' ');
      
      // 构建响应帧用于显示
      let responseFrame = [];
      if (response && response.cmd) {
        responseFrame = [0x55, 0xAA, response.cmd, 1, 0x01];
        const responseCrc = commandBuilder.calculateCRC8(responseFrame);
        responseFrame.push(responseCrc);
      }
      const responseFrameHex = responseFrame.map(byte => byte.toString(16).padStart(2, '0')).join(' ');
      
      Alert.alert(
        '指令发送成功',
        `已向下位机发送指令，取出编号为 ${device.id} 的器件\n对应位置灯已熄灭\n\n发送帧: ${commandFrameHex}\n\n响应帧: ${responseFrameHex}`,
        [{ text: '确定' }]
      );
    } catch (error) {
      console.error('发送指令失败:', error);
      Alert.alert('错误', '发送指令失败，请检查设备连接');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.deviceCard}>
        <View style={styles.deviceIdContainer}>
          <Text style={styles.deviceId}>编号: {device.supplierId || device.id}</Text>
        </View>
        <Text style={styles.deviceName}>{device.name}</Text>
        <Text style={styles.deviceFunction}>{device.function}</Text>
        
        <View style={styles.specContainer}>
          {device.resistance && (
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>电阻:</Text>
              <Text style={styles.specValue}>{device.resistance}</Text>
            </View>
          )}
          {device.voltage && (
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>电压:</Text>
              <Text style={styles.specValue}>{device.voltage}</Text>
            </View>
          )}
          {device.capacitance && (
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>电容:</Text>
              <Text style={styles.specValue}>{device.capacitance}</Text>
            </View>
          )}
          {device.inductance && (
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>电感:</Text>
              <Text style={styles.specValue}>{device.inductance}</Text>
            </View>
          )}
          {device.current && (
            <View style={styles.specItem}>
              <Text style={styles.specLabel}>电流:</Text>
              <Text style={styles.specValue}>{device.current}</Text>
            </View>
          )}
        </View>

        {/* 按钮容器，使两个按钮并排显示 */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity 
            style={[styles.sendButton, isSending && styles.sendButtonDisabled]}
            onPress={handleSendCommand}
            disabled={isSending}
          >
            <Text style={styles.sendButtonText}>
              {isSending ? '发送中...' : '请求此器件'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.takeOutButton, isSending && styles.sendButtonDisabled]}
            onPress={handleTakeOutDevice}
            disabled={isSending}
          >
            <Text style={styles.takeOutButtonText}>
              {isSending ? '发送中...' : '取出器件'}
            </Text>
          </TouchableOpacity>
        </View>
        
        {isAdmin && (
          <TouchableOpacity 
            style={styles.editButton}
            onPress={() => navigation.navigate('AdminEdit', {
              device: device,
              isNew: false,
              onSave: async (updatedDevice) => {
                if (updatedDevice) {
                  // 如果提供了更新后的设备数据，直接使用它刷新页面
                  navigation.replace('DeviceDetail', { device: updatedDevice, isAdmin });
                } else {
                  // 否则从存储中重新加载最新的设备数据
                  try {
                    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
                    const storedDevices = await AsyncStorage.getItem('devices');
                    if (storedDevices) {
                      const devices = JSON.parse(storedDevices);
                      // 尝试使用旧ID查找设备
                      let foundDevice = devices.find(d => d.id === device.id);
                      // 如果找不到，可能是因为ID被修改了，尝试使用其他方式查找
                      if (!foundDevice) {
                        // 这里可以添加其他查找逻辑，比如通过名称等
                      }
                      if (foundDevice) {
                        // 使用找到的设备数据刷新页面
                        navigation.replace('DeviceDetail', { device: foundDevice, isAdmin });
                      } else {
                        // 如果找不到设备，使用旧数据刷新页面
                        navigation.replace('DeviceDetail', { device, isAdmin });
                      }
                    } else {
                      // 如果存储中没有数据，使用旧数据刷新页面
                      navigation.replace('DeviceDetail', { device, isAdmin });
                    }
                  } catch (error) {
                    console.error('重新加载设备数据失败:', error);
                    // 出错时使用旧数据刷新页面
                    navigation.replace('DeviceDetail', { device, isAdmin });
                  }
                }
              },
            })}
          >
            <Text style={styles.editButtonText}>编辑器件</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    padding: 16,
  },
  deviceCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  deviceIdContainer: {
    backgroundColor: '#1976d2',
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginBottom: 20,
  },
  deviceId: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceName: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
  },
  deviceFunction: {
    fontSize: 16,
    color: '#666',
    marginBottom: 24,
  },
  specContainer: {
    marginBottom: 28,
  },
  specItem: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  specLabel: {
    fontSize: 16,
    fontWeight: '600',
    width: 60,
  },
  specValue: {
    fontSize: 16,
    color: '#333',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  sendButton: {
    backgroundColor: '#4caf50',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  takeOutButton: {
    backgroundColor: '#f44336',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    flex: 1,
    marginLeft: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  sendButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  takeOutButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  editButton: {
    backgroundColor: '#1976d2',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  editButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },

});

export default DeviceDetailScreen;