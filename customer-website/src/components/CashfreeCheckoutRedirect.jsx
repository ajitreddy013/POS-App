import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

const CashfreeCheckoutRedirect = () => {
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sessionId = searchParams.get('sessionId') || searchParams.get('session_id');
    const env = searchParams.get('env') || 'sandbox';

    if (!sessionId) {
      setError('Invalid checkout session ID. Please try again.');
      setLoading(false);
      return;
    }

    const triggerCheckout = async () => {
      if (!window.Cashfree) {
        setError('Cashfree payment gateway SDK failed to load. Please refresh the page.');
        setLoading(false);
        return;
      }

      try {
        const cashfree = window.Cashfree({
          mode: env
        });
        const result = await cashfree.checkout({
          paymentSessionId: sessionId,
          redirectTarget: '_self'
        });
        // redirectTarget: '_self' normally navigates away before this resolves;
        // reaching here with an error means Cashfree rejected the session instead.
        if (result?.error) {
          throw new Error(result.error.message || 'Cashfree rejected the payment session.');
        }
      } catch (err) {
        console.error('Cashfree SDK initiation failed:', err);
        setError(err.message || 'Failed to launch payment checkout.');
        setLoading(false);
      }
    };

    // Wait for Cashfree SDK script to be loaded
    if (window.Cashfree) {
      triggerCheckout();
    } else {
      let checkCount = 0;
      const interval = setInterval(() => {
        checkCount++;
        if (window.Cashfree) {
          clearInterval(interval);
          triggerCheckout();
        } else if (checkCount > 50) { // 5 seconds timeout
          clearInterval(interval);
          setError('Failed to load Cashfree payment SDK. Please check your internet connection.');
          setLoading(false);
        }
      }, 100);
      return () => clearInterval(interval);
    }
  }, [searchParams]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      backgroundColor: '#f6f3ee',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      padding: '20px',
      boxSizing: 'border-box'
    }}>
      <div style={{
        maxWidth: '400px',
        width: '100%',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        padding: '30px',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.05)',
        textAlign: 'center',
        border: '1px solid #e6ded3'
      }}>
        {error ? (
          <div>
            <div style={{ fontSize: '3rem', marginBottom: '15px' }}>⚠️</div>
            <h3 style={{ margin: '0 0 10px 0', color: '#dc2626', fontWeight: 'bold' }}>Checkout Error</h3>
            <p style={{ margin: '0', color: '#6b7280', fontSize: '0.95rem', lineHeight: '1.5' }}>{error}</p>
          </div>
        ) : (
          <div>
            <div style={{
              display: 'inline-block',
              width: '40px',
              height: '40px',
              border: '4px solid #b6412c33',
              borderTopColor: '#b6412c',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '20px'
            }} />
            <style>{`
              @keyframes spin {
                to { transform: rotate(360deg); }
              }
            `}</style>
            <h3 style={{ margin: '0 0 10px 0', color: '#221f1a', fontWeight: 'bold' }}>Secure Checkout</h3>
            <p style={{ margin: '0', color: '#7f766a', fontSize: '0.95rem', lineHeight: '1.5' }}>
              Redirecting you to the Cashfree secure payment gateway...
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CashfreeCheckoutRedirect;
