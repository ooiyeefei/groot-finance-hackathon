import { Home, FileText, CreditCard, MessageSquare, Settings } from 'lucide-react'

export default function Sidebar() {
  return (
    <div className="w-64 bg-gray-800 border-r border-gray-700 flex flex-col">
      {/* Logo */}
      <div className="p-6 border-b border-gray-700">
        <h2 className="text-xl font-bold text-white">FinanSEAL</h2>
        <p className="text-sm text-gray-400">Financial Co-Pilot</p>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          <li>
            <a
              href="#"
              className="flex items-center p-3 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              <Home className="w-5 h-5 mr-3" />
              Dashboard
            </a>
          </li>
          <li>
            <a
              href="#"
              className="flex items-center p-3 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              <FileText className="w-5 h-5 mr-3" />
              Documents
            </a>
          </li>
          <li>
            <a
              href="#"
              className="flex items-center p-3 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              <CreditCard className="w-5 h-5 mr-3" />
              Transactions
            </a>
          </li>
          <li>
            <a
              href="#"
              className="flex items-center p-3 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              <MessageSquare className="w-5 h-5 mr-3" />
              AI Assistant
            </a>
          </li>
          <li>
            <a
              href="#"
              className="flex items-center p-3 rounded-lg text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
            >
              <Settings className="w-5 h-5 mr-3" />
              Settings
            </a>
          </li>
        </ul>
      </nav>
    </div>
  )
}