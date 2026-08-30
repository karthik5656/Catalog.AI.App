import { Link } from 'react-router-dom';

function MerchantHome() {
  return (
    <div style={{ padding: '24px' }}>
      <h1>Merchant Dashboard</h1>
      <p>Welcome to the Merchant module.</p>
      <nav style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
        <Link to="products" style={{ color: '#aa3bff' }}>Products</Link>
        <Link to="orders" style={{ color: '#aa3bff' }}>Orders</Link>
      </nav>
    </div>
  );
}

export default MerchantHome;
