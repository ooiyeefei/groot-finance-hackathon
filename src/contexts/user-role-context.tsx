'use client'

import React, { createContext, useContext } from 'react'

export interface UserRoleData {
  employee: boolean
  manager: boolean
  finance_admin: boolean
}

interface UserRoleContextType {
  userRole: UserRoleData | null
}

const UserRoleContext = createContext<UserRoleContextType>({
  userRole: null,
})

export const useUserRole = () => {
  const context = useContext(UserRoleContext)
  return context.userRole
}

interface UserRoleProviderProps {
  children: React.ReactNode
  initialUserRole?: UserRoleData
}

export function UserRoleProvider({ children, initialUserRole }: UserRoleProviderProps) {
  return (
    <UserRoleContext.Provider
      value={{
        userRole: initialUserRole || null,
      }}
    >
      {children}
    </UserRoleContext.Provider>
  )
}