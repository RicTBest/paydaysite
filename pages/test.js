export default function Test() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-green-100 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-emerald-800 mb-8">🏈 CSS Test Page</h1>
        
        <div className="bg-white rounded-xl shadow-lg p-6 mb-6">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">Tailwind CSS Test</h2>
          <p className="text-gray-600 mb-4">If you can see this styled properly, Tailwind is working!</p>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-100 p-4 rounded-lg">
              <div className="font-bold text-blue-800">Blue Card</div>
              <div className="text-blue-600">This should be blue</div>
            </div>
            <div className="bg-green-100 p-4 rounded-lg">
              <div className="font-bold text-green-800">Green Card</div>
              <div className="text-green-600">This should be green</div>
            </div>
            <div className="bg-red-100 p-4 rounded-lg">
              <div className="font-bold text-red-800">Red Card</div>
              <div className="text-red-600">This should be red</div>
            </div>
          </div>
          
          <button className="bg-gradient-to-r from-emerald-500 to-green-600 text-white px-6 py-3 rounded-lg font-bold hover:from-emerald-600 hover:to-green-700 transition-all transform hover:scale-105 shadow-lg">
            Fancy Button
          </button>
        </div>
        
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
          <strong>Debug Info:</strong> If this page looks like plain text with no colors or styling, then Tailwind CSS is not loading properly.
        </div>
        
        <div className="mt-6">
          <a href="/" className="text-blue-500 hover:text-blue-700 underline">← Back to Main Page</a>
        </div>
      </div>
    </div>
  )
}