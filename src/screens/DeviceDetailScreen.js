import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import CommandBuilder from '../services/CommandBuilder';
import StorageService from '../services/StorageService';

const DeviceDetailScreen = ({ navigation, route }) => {
  const { device, isAdmin } = route.params || { device: {}, isAdmin: false };
  const [isSending, setIsSending] = useState(false);
  const [hardwarePosition, setHardwarePosition] = useState(1);

  const getHardwarePosition = useMemo(async () => {
    try {
      const devices = await StorageService.getDevices();
      const index = devices.findIndex((d) => d.id === device.id);
      const position = index >= 0 ? index + 1 : 1;
      setHardwarePosition(position);
      return position;
    } catch (error) {
      console.error('获取硬件位置失败:', error);
      return 1;
    }
  }, [device.id]);

  const handleSendCommand = async () => {
    if (!global.deviceConnection) {
      Alert.alert('提示', '请先在连接页面连接蓝牙设备');
      return;
    }

    setIsSending(true);
    try {
      const { handler } = global.deviceConnection;
      const position = await getHardwarePosition;

      const response = await handler.sendCommand({
        type: 'lightOn',
        lightId: position,
      });

      const commandBuilder = new CommandBuilder();
      const commandFrame = commandBuilder.buildLightOnCommand(position);
      const commandFrameHex = commandFrame
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(' ');

      let responseFrame = [];
      if (response && response.cmd) {
        responseFrame = [0x55, 0xaa, response.cmd, 0x02, 0x00, 0x01];
        const responseCrc = commandBuilder.calculateCRC8(responseFrame);
        responseFrame.push(responseCrc);
      } else if (response && response.success) {
        responseFrame = [0x55, 0xaa, 0x81, 0x02, 0x00, 0x01];
        const responseCrc = commandBuilder.calculateCRC8(responseFrame);
        responseFrame.push(responseCrc);
      }
      const responseFrameHex = responseFrame
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(' ');

      Alert.alert(
        '指令发送成功',
        `已向下位机发送指令，请求编号为 ${device.supplierId || device.id} 的器件\n对应位置灯已亮起\n位置: ${position}\n\n发送帧: ${commandFrameHex}\n\n响应帧: ${responseFrameHex}`,
        [{ text: '确定' }]
      );
    } catch (error) {
      console.error('发送指令失败:', error);
      Alert.alert('错误', `发送指令失败: ${error.message || '未知错误'}`);
    } finally {
      setIsSending(false);
    }
  };

  const handleTakeOutDevice = async () => {
    if (!global.deviceConnection) {
      Alert.alert('提示', '请先在连接页面连接蓝牙设备');
      return;
    }

    setIsSending(true);
    try {
      const { handler } = global.deviceConnection;
      const position = await getHardwarePosition;

      const response = await handler.sendCommand({
        type: 'lightOff',
        lightId: position,
      });

      const commandBuilder = new CommandBuilder();
      const commandFrame = commandBuilder.buildLightOffCommand(position);
      const commandFrameHex = commandFrame
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(' ');

      let responseFrame = [];
      if (response && response.cmd) {
        responseFrame = [0x55, 0xaa, response.cmd, 0x02, 0x00, 0x01];
        const responseCrc = commandBuilder.calculateCRC8(responseFrame);
        responseFrame.push(responseCrc);
      } else if (response && response.success) {
        responseFrame = [0x55, 0xaa, 0x82, 0x02, 0x00, 0x01];
        const responseCrc = commandBuilder.calculateCRC8(responseFrame);
        responseFrame.push(responseCrc);
      }
      const responseFrameHex = responseFrame
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(' ');

      Alert.alert(
        '指令发送成功',
        `已向下位机发送指令，取出编号为 ${device.supplierId || device.id} 的器件\n对应位置灯已熄灭\n位置: ${position}\n\n发送帧: ${commandFrameHex}\n\n响应帧: ${responseFrameHex}`,
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
          <Text style={styles.deviceId}>
            编号: {device.supplierId || device.id}
          </Text>
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
            style={[
              styles.takeOutButton,
              isSending && styles.sendButtonDisabled,
            ]}
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
            onPress={() =>
              navigation.navigate('AdminEdit', {
                device: device,
                isNew: false,
                onSave: () => {
                  navigation.goBack();
                },
              })
            }
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
