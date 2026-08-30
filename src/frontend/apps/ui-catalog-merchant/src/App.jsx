import { Routes, Route } from 'react-router-dom';
import MerchantHome from './pages/MerchantHome';
import MerchantProducts from './pages/MerchantProducts';
import MerchantOrders from './pages/MerchantOrders';
import './App.css';

function App() {
  return (
    <Routes>
      <Route index element={<MerchantHome />} />
      <Route path="products" element={<MerchantProducts />} />
      <Route path="orders" element={<MerchantOrders />} />
    </Routes>
  );
}

export default App;
