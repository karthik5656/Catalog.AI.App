import { Link } from 'react-router-dom';

function MerchantProducts() {
  return (
    <div style={{ padding: '24px' }}>
      <h1>Products</h1>
      <p>Manage your product catalog here.</p>
      <Link to=".." style={{ color: '#aa3bff', marginTop: '16px', display: 'inline-block' }}>
        ← Back to Merchant Home
      </Link>
    </div>
  );
}

export default MerchantProducts;
