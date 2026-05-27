import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import StorageService from '../services/StorageService';
import { logError, formatErrorMessage } from '../utils/ErrorHandler';
import { useUser } from '../context/UserContext';

const ProfileScreen = ({ navigation, route }) => {
  const { user, updateUser } = useUser();
  const [userInfo, setUserInfo] = useState({
    username: 'admin',
    role: '管理员',
  });

  // 导出相关状态
  const [exportFileName, setExportFileName] = useState('');
  const [showExportModal, setShowExportModal] = useState(false);

  useEffect(() => {
    // 始终为管理员身份
    setUserInfo({
      username: 'admin',
      role: '管理员',
    });
  }, []);

  const handleAbout = () => {
    Alert.alert(
      '关于',
      '器件管理系统 v1.0.0\n\n用于管理电子器件的库存和取用\n\n© 2026 器件管理系统'
    );
  };

  // 打开导出文件名输入弹窗
  const handleOpenExportModal = () => {
    const defaultName = `器件数据_${new Date().toISOString().slice(0, 10).replace(/-/g, '')}.json`;
    setExportFileName(defaultName);
    setShowExportModal(true);
  };

  // 关闭导出弹窗
  const handleCloseExportModal = () => {
    setShowExportModal(false);
    setExportFileName('');
  };

  // 数据导出
  const handleExportData = async () => {
    if (!exportFileName.trim()) {
      Alert.alert('提示', '请输入文件名');
      return;
    }

    try {
      const backupData = await StorageService.exportAllData();
      const backupJson = JSON.stringify(backupData, null, 2);

      const fileName = exportFileName.endsWith('.json') ? exportFileName : `${exportFileName}.json`;

      // 先写入应用缓存目录
      const cachePath = `${FileSystem.cacheDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(cachePath, backupJson);

      setShowExportModal(false);
      setExportFileName('');

      // 通过系统分享/保存界面，让用户选择保存位置
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(cachePath, {
          mimeType: 'application/json',
          dialogTitle: '保存导出数据',
          UTI: 'public.json',
        });
      } else {
        // 不支持分享时，保存到默认文档目录
        const docPath = `${FileSystem.documentDirectory}${fileName}`;
        await FileSystem.writeAsStringAsync(docPath, backupJson);
        Alert.alert(
          '数据导出',
          `导出成功！\n\n文件: ${fileName}\n导出时间: ${backupData.exportDate}`,
          [{ text: '确定' }]
        );
      }

      // 清理缓存文件
      try {
        await FileSystem.deleteAsync(cachePath);
      } catch (e) {
        // 忽略清理失败
      }
    } catch (error) {
      logError('导出数据失败', error, 'ProfileScreen.handleExportData');
      Alert.alert('错误', `导出数据失败: ${error.message || '请重试'}`);
    }
  };

  // 数据导入
  const handleImportData = async () => {
    Alert.alert('数据导入', '此操作将覆盖当前所有数据，确定要继续吗？', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定',
        style: 'destructive',
        onPress: async () => {
          try {
            const result = await DocumentPicker.getDocumentAsync({
              type: 'application/json',
              copyToCacheDirectory: true,
            });

            if (result.canceled) {
              return;
            }

            const fileUri = result.assets[0].uri;
            const fileContent = await FileSystem.readAsStringAsync(fileUri);
            const backupData = JSON.parse(fileContent);

            await StorageService.importAllData(backupData);

            Alert.alert('成功', '数据导入成功！\n\n应用将重启以加载新数据。', [
              {
                text: '确定',
                onPress: async () => {
                  navigation.reset({
                    index: 0,
                    routes: [{ name: 'MainTabs' }],
                  });
                },
              },
            ]);
          } catch (error) {
            logError('导入数据失败', error, 'ProfileScreen.handleImportData');
            Alert.alert(
              '错误',
              `导入数据失败: ${error.message || '请检查文件格式并重试'}`
            );
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>个人中心</Text>
      </View>

      <ScrollView style={styles.content}>
        <View style={styles.userInfoContainer}>
          <View style={styles.avatarContainer}>
            <Text style={styles.avatarText}>
              {userInfo.username.charAt(0).toUpperCase()}
            </Text>
          </View>
          <Text style={styles.username}>{userInfo.username}</Text>
          <Text style={styles.role}>{userInfo.role}</Text>
        </View>

        <View style={styles.menuContainer}>
          <TouchableOpacity style={styles.menuItem} onPress={handleOpenExportModal}>
            <Text style={styles.menuText}>数据导出</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={handleImportData}>
            <Text style={styles.menuText}>数据导入</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, styles.lastMenuItem]}
            onPress={handleAbout}
          >
            <Text style={styles.menuText}>关于</Text>
            <Text style={styles.menuArrow}>›</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* 数据导出文件名输入弹窗 */}
      <Modal
        visible={showExportModal}
        animationType="slide"
        transparent={true}
        onRequestClose={handleCloseExportModal}
      >
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>数据导出</Text>

            <View style={styles.inputContainer}>
              <Text style={styles.inputLabel}>文件名</Text>
              <TextInput
                style={styles.fileNameInput}
                value={exportFileName}
                onChangeText={setExportFileName}
                placeholder="请输入文件名"
                autoFocus={true}
              />
              <Text style={styles.fileNameHint}>默认命名格式：器件数据_日期</Text>
              <Text style={styles.fileNameHint}>点击导出后可选择保存位置</Text>
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleCloseExportModal}
              >
                <Text style={styles.cancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.submitButton]}
                onPress={handleExportData}
              >
                <Text style={styles.submitButtonText}>导出</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  },
  userInfoContainer: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: 'white',
    marginBottom: 16,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#007AFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  username: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  role: {
    fontSize: 14,
    color: '#666',
  },
  menuContainer: {
    backgroundColor: 'white',
  },
  menuItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  lastMenuItem: {
    borderBottomWidth: 0,
  },
  menuText: {
    fontSize: 16,
  },
  menuArrow: {
    fontSize: 20,
    color: '#999',
  },
  logoutText: {
    color: '#FF3B30',
    fontWeight: 'bold',
  },

  // 模态框样式
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '85%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    color: '#333',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: '#8E8E93',
    marginRight: 8,
  },
  submitButton: {
    backgroundColor: '#007AFF',
    marginLeft: 8,
  },
  cancelButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  submitButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  fileNameInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    padding: 12,
    fontSize: 16,
  },
  fileNameHint: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
});

export default ProfileScreen;