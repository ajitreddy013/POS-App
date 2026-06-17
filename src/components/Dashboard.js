import { dbService } from "../services/dbService";
import React, { useState, useEffect } from "react";
import {
  BarChart3,
  RefreshCw,
} from "lucide-react";
import { 
  getLocalDateString,
  formatDateForDisplay,
  getStartOfDay,
  getEndOfDay,
  formatDateTimeToString
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
    recentSales: [],
  });
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(null);

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
      setLoading(true);

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
        recentSales: recentSales.slice(0, 10),
      });

      setLastUpdated(formatDateTimeToString(new Date()));
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    return formatDateForDisplay(dateString);
  };


  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>
          <BarChart3 size={24} /> Dashboard
        </h1>
        <button
          onClick={loadDashboardData}
          disabled={loading}
          className="btn btn-secondary"
          style={{ marginLeft: "auto" }}
        >
          <RefreshCw size={16} style={{ marginRight: "8px" }} />
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="summary-cards">
        <div className="summary-card">
          <h3>Total Products</h3>
          <div className="value">{dashboardData.totalProducts}</div>
        </div>
        <div className="summary-card">
          <h3>Today&apos;s Sales</h3>
          <div className="value">{dashboardData.todaySales}</div>
        </div>
        <div className="summary-card">
          <h3>Today&apos;s Revenue</h3>
          <div className="value">₹{dashboardData.totalRevenue.toFixed(2)}</div>
        </div>
        <div className="summary-card">
          <h3>Today&apos;s Spendings</h3>
          <div className="value">
            ₹{dashboardData.todaySpendings.toFixed(2)}
          </div>
        </div>
        <div className="summary-card">
          <h3>Net Income</h3>
          <div className="value">
            ₹{dashboardData.netIncome.toFixed(2)}
          </div>
        </div>
        <div className="summary-card">
          <h3>Opening Balance</h3>
          <div className="value">
            ₹{dashboardData.openingBalance.toFixed(2)}
          </div>
        </div>
        <div className="summary-card">
          <h3>Total Balance</h3>
          <div className="value positive">₹{dashboardData.totalBalance.toFixed(2)}</div>
        </div>
      </div>

      {/* Last Updated Info */}
      {lastUpdated && (
        <div
          style={{
            textAlign: "center",
            margin: "20px 0",
            color: "#7f8c8d",
            fontSize: "0.9rem",
          }}
        >
          Last updated: {lastUpdated}
        </div>
      )}

      {/* Alerts */}

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
                        textTransform: "capitalize",
                        background: "#e9ecef",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        fontSize: "0.8rem",
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
