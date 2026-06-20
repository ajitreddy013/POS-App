import { dbService } from "../services/dbService";
import React, { useState, useEffect } from "react";
import {
  Package,
  Activity,
  Wallet,
  History,
  Landmark,
  Banknote
} from "lucide-react";
import { 
  getLocalDateString,
  formatDateForDisplay,
  getStartOfDay,
  getEndOfDay,
} from "../utils/dateUtils";

const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState({
    totalProducts: 0,
    lowStockItems: 0,
    todaySales: 0,
    totalRevenue: 0,
    todaySpendings: 0,
    netIncome: 0,
    openingBalance: 0,
    totalBalance: 0,
    todayCash: 0,
    todayUpi: 0,
    recentSales: [],
  });

  useEffect(() => {
    loadDashboardData();

    // Auto-refresh every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);

    // Listen for sale completion events
    const handleSaleCompleted = () => {
      // eslint-disable-next-line no-console
      console.log("Sale completed event received, refreshing dashboard...");
      loadDashboardData();
    };

    window.addEventListener("saleCompleted", handleSaleCompleted);

    return () => {
      clearInterval(interval);
      window.removeEventListener("saleCompleted", handleSaleCompleted);
    };
  }, []);

  const loadDashboardData = async () => {
    try {
      // Get inventory data
      const inventory = await dbService.getInventory() || [];
      const lowStockItems = inventory.filter(
        (item) => (item.godown_stock || 0) + (item.counter_stock || 0) <= (item.min_stock_level || 0)
      );

      // Get today's sales using system local date
      const todayDate = getLocalDateString(); // YYYY-MM-DD format in local time

      // eslint-disable-next-line no-console
      console.log("Dashboard loading for date:", todayDate); // Debug log

      const todaySales = await dbService.getSales({
        startDate: getStartOfDay(todayDate),
        endDate: getEndOfDay(todayDate),
      }) || [];

      // eslint-disable-next-line no-console
      console.log("Today sales found:", todaySales.length); // Debug log

      const todayRevenue = todaySales.reduce(
        (sum, sale) => sum + Number(sale.totalAmount || sale.total_amount || 0),
        0
      );

      const todayCash = todaySales
        .filter(s => s.paymentMethod === 'cash' || s.payment_method === 'cash')
        .reduce((sum, sale) => sum + Number(sale.totalAmount || sale.total_amount || 0), 0);

      const todayUpi = todaySales
        .filter(s => s.paymentMethod === 'upi' || s.payment_method === 'upi')
        .reduce((sum, sale) => sum + Number(sale.totalAmount || sale.total_amount || 0), 0);

      // Get today's spendings
      const todaySpendings = Number(await dbService.getDailySpendingTotal(todayDate) || 0);
      const netIncome = todayRevenue - todaySpendings;

      // Get today's opening balance
      const todayCounterBalance = await dbService.getCounterBalance(todayDate);
      const openingBalance = todayCounterBalance
        ? Number(todayCounterBalance.opening_balance || todayCounterBalance.openingBalance || 0)
        : 0;

      // Calculate total balance (net income + opening balance)
      const totalBalance = netIncome + openingBalance;

      // Use today's sales for recent sales and sort them by date descending
      const recentSales = [...todaySales];
      recentSales.sort((a, b) => new Date(b.saleDate || b.sale_date) - new Date(a.saleDate || a.sale_date));

      setDashboardData({
        totalProducts: inventory.length,
        lowStockItems: lowStockItems.length,
        todaySales: todaySales.length,
        totalRevenue: Number(todayRevenue || 0),
        todaySpendings: Number(todaySpendings || 0),
        netIncome: Number(netIncome || 0),
        openingBalance: Number(openingBalance || 0),
        totalBalance: Number(totalBalance || 0),
        todayCash: Number(todayCash || 0),
        todayUpi: Number(todayUpi || 0),
        recentSales: recentSales.slice(0, 10),
      });

    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load dashboard data:", error);
    }
  };

  const formatDate = (dateString) => {
    return formatDateForDisplay(dateString);
  };

  const totalAmount = dashboardData.todayCash + dashboardData.todayUpi + dashboardData.openingBalance - dashboardData.todaySpendings;

  return (
    <div className="dashboard">
      <div className="page-header dashboard-page-header">
        <div className="dashboard-header-copy">
          <h1>Dashboard</h1>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card card-teal">
          <div className="card-header">
            <h3>Today&apos;s Sales</h3>
            <div className="card-icon"><Activity size={16} /></div>
          </div>
          <div className="value">{dashboardData.todaySales}</div>
        </div>

        <div className="summary-card card-blue">
          <div className="card-header">
            <h3>Total Products</h3>
            <div className="card-icon"><Package size={16} /></div>
          </div>
          <div className="value">{dashboardData.totalProducts}</div>
        </div>

        <div className="summary-card card-mauve">
          <div className="card-header">
            <h3>Today&apos;s Spendings</h3>
            <div className="card-icon"><Wallet size={16} /></div>
          </div>
          <div className="value">₹{dashboardData.todaySpendings.toFixed(0)}</div>
        </div>

        <div className="summary-card card-slate">
          <div className="card-header">
            <h3>Opening Balance</h3>
            <div className="card-icon"><History size={16} /></div>
          </div>
          <div className="value">₹{dashboardData.openingBalance.toFixed(0)}</div>
        </div>
        
        <div className="summary-card card-purple">
          <div className="card-header">
            <h3>Payment Methods</h3>
            <div className="card-icon"><Wallet size={16} /></div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%', marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', fontSize: '0.85rem', fontWeight: '600' }}>
              <span>Cash:</span>
              <span style={{ fontWeight: '800', fontSize: '1.05rem' }}>₹{dashboardData.todayCash.toFixed(0)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', fontSize: '0.85rem', fontWeight: '600' }}>
              <span>UPI:</span>
              <span style={{ fontWeight: '800', fontSize: '1.05rem' }}>₹{dashboardData.todayUpi.toFixed(0)}</span>
            </div>
          </div>
        </div>

        <div className="summary-card card-mint">
          <div className="card-header">
            <h3>Total Sales</h3>
            <div className="card-icon"><Banknote size={16} /></div>
          </div>
          <div className="value">₹{(dashboardData.todayCash + dashboardData.todayUpi).toFixed(0)}</div>
        </div>

        <div className="summary-card card-sunset">
          <div className="card-header">
            <h3>Total Amount</h3>
            <div className="card-icon"><Landmark size={16} /></div>
          </div>
          <div className={`value ${totalAmount >= 0 ? 'positive' : 'negative'}`}>
            ₹{totalAmount.toFixed(0)}
          </div>
        </div>
      </div>



      {/* Recent Sales */}
      <div className="table-container">
        <h2
          style={{
            padding: "20px",
            margin: 0,
            borderBottom: "1px solid #e9ecef",
          }}
        >
          Recent Sales
        </h2>
        <table>
          <thead>
            <tr>
              <th>Sale Number</th>
              <th>Customer</th>
              <th>Items</th>
              <th>Amount</th>
              <th>Payment</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {dashboardData.recentSales.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  style={{
                    textAlign: "center",
                    padding: "40px",
                    color: "#7f8c8d",
                  }}
                >
                  No sales recorded yet
                </td>
              </tr>
            ) : (
              dashboardData.recentSales.map((sale) => (
                <tr key={sale.id}>
                  <td>{sale.saleNumber || sale.sale_number}</td>
                  <td>{sale.customerName || sale.customer_name || "Walk-in Customer"}</td>
                  <td>{sale.items ? sale.items.length : (sale.item_count || '-')} items</td>
                  <td>₹{(sale.totalAmount || sale.total_amount || 0).toFixed(2)}</td>
                  <td>
                    <span
                      style={{
                        textTransform: "uppercase",
                        fontWeight: "600",
                        letterSpacing: "0.5px",
                        background: (sale.paymentMethod || sale.payment_method) === "upi" ? "rgba(102, 126, 234, 0.15)" : "rgba(39, 174, 96, 0.15)",
                        color: (sale.paymentMethod || sale.payment_method) === "upi" ? "#667eea" : "#27ae60",
                        padding: "4px 10px",
                        borderRadius: "20px",
                        fontSize: "0.75rem",
                      }}
                    >
                      {sale.paymentMethod || sale.payment_method}
                    </span>
                  </td>
                  <td>{formatDate(sale.saleDate || sale.sale_date)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Dashboard;
