import React, { useState, useEffect } from 'react';
import nhentaiProxyManager from '../../services/nhentaiProxyManager';

interface ProxyStatus {
  available: boolean;
  ports: number[];
  message: string;
}

interface ProxyRecommendation {
  type: string;
  instructions: string;
  priority: number;
}

const NHentaiProxySetup: React.FC = () => {
  const [torStatus, setTorStatus] = useState<ProxyStatus | null>(null);
  const [recommendations, setRecommendations] = useState<ProxyRecommendation[]>([]);
  const [testing, setTesting] = useState(false);
  const [proxyEnabled, setProxyEnabled] = useState(false);
  const [selectedPort, setSelectedPort] = useState(9050);

  useEffect(() => {
    loadRecommendations();
    checkTorStatus();
    
    // Load current proxy settings (placeholder - would need actual API)
    // const enabled = window.settings?.get('nhentaiProxyEnabled') || false;
    // setProxyEnabled(enabled);
  }, []);

  const loadRecommendations = () => {
    const recs = nhentaiProxyManager.getProxyRecommendations();
    setRecommendations(recs);
  };

  const checkTorStatus = async () => {
    setTesting(true);
    try {
      const status = await nhentaiProxyManager.checkTorAvailability();
      setTorStatus(status);
      
      if (status.available && status.ports.length > 0) {
        setSelectedPort(status.ports[0]);
      }
    } catch (error) {
      console.error('Failed to check Tor status:', error);
      setTorStatus({
        available: false,
        ports: [],
        message: 'Failed to check Tor status'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleEnableProxy = async (enabled: boolean) => {
    setProxyEnabled(enabled);
    
    // TODO: Save setting through proper API when implemented
    console.log('Setting nhentaiProxyEnabled to:', enabled);
    
    if (enabled && torStatus?.available && selectedPort) {
      console.log('Setting torEnabled to true, port:', selectedPort);
    }
  };

  const runSetupScript = () => {
    // TODO: Trigger the setup script execution when API is available
    // For now, show manual instructions
    alert('Please run the setup-tor.sh script from the project directory:\n\ncd /path/to/simanga\n./setup-tor.sh');
  };

  const openTorBrowser = () => {
    window.open('https://www.torproject.org/download/', '_blank');
  };

  const openBridges = () => {
    window.open('https://bridges.torproject.org/', '_blank');
  };

  return (
    <div className="bg-gray-800 rounded-lg p-6 max-w-4xl mx-auto">
      <h2 className="text-xl font-bold text-white mb-4">
        🧅 nHentai Proxy Setup
      </h2>
      
      <div className="text-gray-300 mb-6">
        <p>nHentai is often blocked in many regions. Use Tor or other proxies to bypass restrictions.</p>
      </div>

      {/* Current Status */}
      <div className="bg-gray-700 rounded p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">Current Status</h3>
          <button
            onClick={checkTorStatus}
            disabled={testing}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
          >
            {testing ? 'Testing...' : 'Refresh'}
          </button>
        </div>
        
        {torStatus && (
          <div className="space-y-2">
            <div className="flex items-center">
              <span className={`inline-block w-3 h-3 rounded-full mr-2 ${
                torStatus.available ? 'bg-green-500' : 'bg-red-500'
              }`}></span>
              <span className="text-white font-medium">
                Tor: {torStatus.available ? 'Available' : 'Not Available'}
              </span>
            </div>
            
            {torStatus.available && torStatus.ports.length > 0 && (
              <div className="text-sm text-gray-300">
                Available ports: {torStatus.ports.join(', ')}
              </div>
            )}
            
            <div className="text-sm text-gray-400">
              {torStatus.message}
            </div>
          </div>
        )}
      </div>

      {/* Proxy Toggle */}
      <div className="bg-gray-700 rounded p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-white">Enable nHentai Proxy</h3>
            <p className="text-sm text-gray-400">Route nHentai requests through Tor/proxy</p>
          </div>
          
          <label className="relative inline-flex items-center cursor-pointer">
            <input
              type="checkbox"
              checked={proxyEnabled}
              onChange={(e) => handleEnableProxy(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </label>
        </div>
        
        {proxyEnabled && torStatus?.available && (
          <div className="mt-4">
            <label className="block text-sm text-gray-300 mb-2">Tor Port:</label>
            <select
              value={selectedPort}
              onChange={(e) => setSelectedPort(parseInt(e.target.value))}
              className="bg-gray-600 text-white px-3 py-1 rounded"
            >
              {torStatus.ports.map(port => (
                <option key={port} value={port}>
                  {port} {port === 9050 ? '(Standalone Tor)' : port === 9150 ? '(Tor Browser)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Setup Options */}
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-white">Setup Options</h3>
        
        {recommendations.map((rec, index) => (
          <div key={index} className="bg-gray-700 rounded p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h4 className="font-medium text-white mb-2">
                  #{rec.priority} {rec.type}
                </h4>
                <p className="text-sm text-gray-300">{rec.instructions}</p>
              </div>
              
              <div className="ml-4 space-x-2">
                {rec.type === 'Tor Browser' && (
                  <button
                    onClick={openTorBrowser}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Download
                  </button>
                )}
                
                {rec.type === 'Standalone Tor' && (
                  <button
                    onClick={runSetupScript}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm"
                  >
                    Auto Setup
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Advanced Options */}
      <div className="mt-6 bg-yellow-900 bg-opacity-50 rounded p-4">
        <h3 className="text-lg font-semibold text-yellow-300 mb-2">
          🌍 Restricted Countries (Turkey, China, etc.)
        </h3>
        <p className="text-sm text-yellow-200 mb-3">
          If you're in a country that blocks Tor, you'll need bridges:
        </p>
        <button
          onClick={openBridges}
          className="bg-yellow-700 hover:bg-yellow-800 text-white px-4 py-2 rounded"
        >
          Get Tor Bridges
        </button>
      </div>

      {/* Quick Test */}
      {proxyEnabled && (
        <div className="mt-6 bg-blue-900 bg-opacity-50 rounded p-4">
          <h3 className="text-lg font-semibold text-blue-300 mb-2">
            🔧 Test Connection
          </h3>
          <p className="text-sm text-blue-200 mb-3">
            Test if nHentai is accessible with your current proxy settings:
          </p>
          <button
            onClick={() => {
              // TODO: Test adapter when API is available
              console.log('Testing nHentai Enhanced adapter...');
              alert('Adapter testing will be available when the settings API is implemented.');
            }}
            className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded"
          >
            Test nHentai Access
          </button>
        </div>
      )}
    </div>
  );
};

export default NHentaiProxySetup;
