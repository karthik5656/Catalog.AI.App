import { Link } from 'react-router-dom';

function MerchantOrders() {
  return (
    <div style={{ padding: '24px' }}>
      <h1>Orders</h1>
      <p>View and manage orders here.</p>
      <Link to=".." style={{ color: '#aa3bff', marginTop: '16px', display: 'inline-block' }}>
        ← Back to Merchant Home
      </Link>
    </div>
  );
}

export default MerchantOrders;
