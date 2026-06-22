import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import CustomerMenu from './components/CustomerMenu';
import CashfreeCheckoutRedirect from './components/CashfreeCheckoutRedirect';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<CustomerMenu />} />
        <Route path="/menu" element={<CustomerMenu />} />
        <Route path="/checkout" element={<CashfreeCheckoutRedirect />} />
        <Route path="*" element={<CustomerMenu />} />
      </Routes>
    </Router>
  );
}

export default App;
