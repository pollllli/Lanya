/**
 * 应用导航配置
 * 负责管理应用的所有导航路由和登录状态
 */
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import LoginScreen from '../screens/LoginScreen';
import DeviceListScreen from '../screens/DeviceListScreen';
import DeviceDetailScreen from '../screens/DeviceDetailScreen';
import AdminEditScreen from '../screens/AdminEditScreen';
import BOMScreen from '../screens/BOMScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ConnectionScreen from '../screens/ConnectionScreen';
import StorageService from '../services/StorageService';
import { logError } from '../utils/ErrorHandler';

/**
 * 主标签导航组件
 * 包含应用的主要功能模块：库存、连接、BOM配单和个人中心
 * @param {Object} props - 组件属性
 * @param {Object} props.route - 路由对象，包含用户权限信息
 */

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// 主标签导航
const MainTabNavigator = ({ route }) => {
  const { isAdmin, username } = route.params || { isAdmin: false, username: 'user' };
  
  console.log('MainTabNavigator received:', { isAdmin, username });
  
  return (
    <Tab.Navigator
        screenOptions={{
          tabBarActiveTintColor: '#007AFF',
          tabBarInactiveTintColor: '#999',
          tabBarStyle: {
            backgroundColor: '#f5f5f5',
            borderTopWidth: 1,
            borderTopColor: '#ddd',
            height: 60,
          },
          tabBarLabelStyle: {
            fontSize: 14,
          },
          headerShown: false,
        }}
      >
        <Tab.Screen 
          name="DeviceListTab" 
          options={{ 
            title: '库存',
            tabBarTestID: 'tab-inventory',
          }} 
        >
          {(props) => <DeviceListScreen {...props} isAdmin={isAdmin} />}
        </Tab.Screen>
        <Tab.Screen 
          name="Connection" 
          component={ConnectionScreen} 
          options={{ 
            title: '连接',
            tabBarTestID: 'tab-connection',
          }} 
        />
        <Tab.Screen 
          name="BOM" 
          options={{ 
            title: 'BOM配单',
            tabBarTestID: 'tab-bom',
          }} 
        >
          {(props) => <BOMScreen {...props} isAdmin={isAdmin} />}
        </Tab.Screen>
        <Tab.Screen 
            name="Profile" 
            options={{ 
              title: '我的',
              tabBarTestID: 'tab-profile',
            }} 
          >
            {(props) => <ProfileScreen {...props} route={{ 
              ...props.route, 
              params: { 
                ...props.route.params, 
                username: username || (isAdmin ? 'admin' : 'user'), 
                isAdmin 
              } 
            }} />}
          </Tab.Screen>
      </Tab.Navigator>
  );
};

/**
 * 应用主导航组件
 * 负责管理应用的登录状态和路由配置
 */
const AppNavigator = () => {
  const [initialRoute, setInitialRoute] = useState('Login');
  const [isLoading, setIsLoading] = useState(true);

  const [loggedInUser, setLoggedInUser] = useState(null);

  useEffect(() => {
    /**
     * 检查登录状态
     * 应用启动时检查是否有保存的登录用户信息
     * 如果有，直接导航到主界面
     */
    const checkLoginStatus = async () => {
      try {
        // 检查是否有保存的登录用户信息
        const user = await StorageService.getLoggedInUser();
        if (user) {
          // 如果有保存的用户信息，直接导航到主界面
          setLoggedInUser(user);
          setInitialRoute('MainTabs');
        }
      } catch (error) {
        logError('检查登录状态失败', error, 'AppNavigator.checkLoginStatus');
      } finally {
        setIsLoading(false);
      }
    };

    checkLoginStatus();
  }, []);

  if (isLoading) {
    // 可以添加一个加载屏幕
    return null;
  }

  return (
    <Stack.Navigator 
      initialRouteName={initialRoute}
      screenOptions={{
        headerStyle: {
          backgroundColor: '#f5f5f5',
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: '#e0e0e0',
        },
        headerTintColor: '#333',
        headerTitleStyle: {
          fontWeight: '600',
          fontSize: 18,
        },
        headerBackTitleVisible: false,
        headerLeftContainerStyle: {
          paddingLeft: 8,
        },
        transitionSpec: {
          open: {
            animation: 'timing',
            config: {
              duration: 300,
            },
          },
          close: {
            animation: 'timing',
            config: {
              duration: 300,
            },
          },
        },
      }}
    >
      <Stack.Screen 
        name="Login" 
        component={LoginScreen} 
        options={{ 
          title: '登录',
          headerShown: false,
        }} 
      />
      <Stack.Screen 
        name="MainTabs" 
        options={{ headerShown: false }} 
      >
        {(props) => (
          <MainTabNavigator 
            {...props} 
            route={{
              ...props.route,
              params: {
                ...props.route.params,
                isAdmin: props.route.params?.isAdmin || loggedInUser?.isAdmin || false,
                username: props.route.params?.username || loggedInUser?.username || 'user'
              }
            }}
          />
        )}
      </Stack.Screen>
      <Stack.Screen 
        name="DeviceDetail" 
        component={DeviceDetailScreen} 
        options={{ 
          title: '器件详情',
          headerBackTitle: '返回',
        }} 
      />
      <Stack.Screen 
        name="AdminEdit" 
        component={AdminEditScreen} 
        options={({ route }) => ({
          title: route.params?.isNew ? '上架器件' : '编辑器件',
          headerBackTitle: '返回',
        })} 
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;