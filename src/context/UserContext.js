import React, { createContext, useContext, useState, useEffect } from 'react';
import StorageService from '../services/StorageService';
import { logError } from '../utils/ErrorHandler';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchParams, setSearchParams] = useState({
    searchQuery: '',
    selectedShelf: '',
    advancedSearchParams: {
      name: '',
      category: '',
      function: '',
      resistance: '',
      voltage: '',
      capacitance: '',
      inductance: '',
      current: '',
    },
  });

  useEffect(() => {
    const loadUser = async () => {
      try {
        const loggedInUser = await StorageService.getLoggedInUser();
        setUser(loggedInUser);
      } catch (error) {
        logError('加载用户信息失败', error, 'UserProvider.loadUser');
      } finally {
        setIsLoading(false);
      }
    };
    loadUser();
  }, []);

  const login = async (userData) => {
    try {
      await StorageService.saveLoggedInUser(userData);
      setUser(userData);
    } catch (error) {
      logError('登录失败', error, 'UserProvider.login');
      throw error;
    }
  };

  const logout = async () => {
    try {
      await StorageService.removeLoggedInUser();
      setUser(null);
      // 退出登录时重置搜索参数
      setSearchParams({
        searchQuery: '',
        selectedShelf: '',
        advancedSearchParams: {
          name: '',
          category: '',
          function: '',
          resistance: '',
          voltage: '',
          capacitance: '',
          inductance: '',
          current: '',
        },
      });
    } catch (error) {
      logError('退出登录失败', error, 'UserProvider.logout');
      throw error;
    }
  };

  const updateUser = async (updatedUser) => {
    try {
      await StorageService.saveLoggedInUser(updatedUser);
      setUser(updatedUser);
    } catch (error) {
      logError('更新用户信息失败', error, 'UserProvider.updateUser');
      throw error;
    }
  };

  const updateSearchParams = (newParams) => {
    setSearchParams((prev) => ({ ...prev, ...newParams }));
  };

  const clearSearchParams = () => {
    setSearchParams({
      searchQuery: '',
      selectedShelf: '',
      advancedSearchParams: {
        name: '',
        category: '',
        function: '',
        resistance: '',
        voltage: '',
        capacitance: '',
        inductance: '',
        current: '',
      },
    });
  };

  if (isLoading) {
    return null;
  }

  return (
    <UserContext.Provider
      value={{
        user,
        login,
        logout,
        updateUser,
        searchParams,
        updateSearchParams,
        clearSearchParams,
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

export const useUser = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

export default UserContext;