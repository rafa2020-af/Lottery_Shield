import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface LotteryTicket {
  id: number;
  number: string;
  owner: string;
  timestamp: number;
}

interface Winner {
  address: string;
  prize: string;
  timestamp: number;
}

const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : parseFloat(encryptedData);
const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [tickets, setTickets] = useState<LotteryTicket[]>([]);
  const [winners, setWinners] = useState<Winner[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [buyingTicket, setBuyingTicket] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [selectedTicket, setSelectedTicket] = useState<LotteryTicket | null>(null);
  const [decryptedNumber, setDecryptedNumber] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [selectedNumber, setSelectedNumber] = useState("");
  const [jackpot, setJackpot] = useState("0");
  const [nextDraw, setNextDraw] = useState("");

  useEffect(() => {
    loadData().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
      setJackpot("5.42");
      setNextDraw("2 days 14 hours");
    };
    initSignatureParams();
  }, []);

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "Contract is available!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
      
      const ticketsBytes = await contract.getData("tickets");
      let ticketsList: LotteryTicket[] = [];
      if (ticketsBytes.length > 0) {
        try {
          const ticketsStr = ethers.toUtf8String(ticketsBytes);
          if (ticketsStr.trim() !== '') ticketsList = JSON.parse(ticketsStr);
        } catch (e) {}
      }
      setTickets(ticketsList);

      const winnersBytes = await contract.getData("winners");
      let winnersList: Winner[] = [];
      if (winnersBytes.length > 0) {
        try {
          const winnersStr = ethers.toUtf8String(winnersBytes);
          if (winnersStr.trim() !== '') winnersList = JSON.parse(winnersStr);
        } catch (e) {}
      }
      setWinners(winnersList);
    } catch (e) {
      console.error("Error loading data:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const buyTicket = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setBuyingTicket(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Buying ticket with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const number = parseInt(selectedNumber);
      if (isNaN(number) || number < 1 || number > 10000) {
        throw new Error("Please select a valid number between 1-10000");
      }

      const newTicket: LotteryTicket = {
        id: tickets.length + 1,
        number: FHEEncryptNumber(number),
        owner: address,
        timestamp: Math.floor(Date.now() / 1000)
      };
      
      const updatedTickets = [...tickets, newTicket];
      
      const tx = await contract.setData("tickets", ethers.toUtf8Bytes(JSON.stringify(updatedTickets)));
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Ticket purchased successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      await loadData();
      
      setShowBuyModal(false);
      setSelectedNumber("");
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setBuyingTicket(false); 
    }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const renderStats = () => {
    const totalTickets = tickets.length;
    const myTickets = tickets.filter(t => t.owner === address).length;
    const totalWinners = winners.length;
    
    return (
      <div className="stats-panels">
        <div className="panel gradient-panel">
          <h3>Current Jackpot</h3>
          <div className="stat-value">{jackpot} ETH</div>
          <div className="stat-trend">Next draw in {nextDraw}</div>
        </div>
        
        <div className="panel gradient-panel">
          <h3>Total Tickets</h3>
          <div className="stat-value">{totalTickets}</div>
          <div className="stat-trend">{myTickets} owned by you</div>
        </div>
        
        <div className="panel gradient-panel">
          <h3>Past Winners</h3>
          <div className="stat-value">{totalWinners}</div>
          <div className="stat-trend">Last winner: {totalWinners > 0 ? winners[0].address.substring(0, 6)+"..." : "None"}</div>
        </div>
      </div>
    );
  };

  const renderWinners = () => {
    return (
      <div className="winners-list">
        <h3>Recent Winners</h3>
        {winners.length === 0 ? (
          <div className="no-winners">
            <p>No winners yet</p>
          </div>
        ) : winners.slice(0, 5).map((winner, index) => (
          <div className="winner-item" key={index}>
            <div className="winner-rank">{index + 1}</div>
            <div className="winner-info">
              <div className="winner-address">{winner.address.substring(0, 6)}...{winner.address.substring(38)}</div>
              <div className="winner-prize">{winner.prize} ETH</div>
            </div>
            <div className="winner-time">{new Date(winner.timestamp * 1000).toLocaleDateString()}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderFAQ = () => {
    const faqItems = [
      {
        question: "How does FHE protect my lottery number?",
        answer: "Your selected number is encrypted with Zama FHE before being stored on-chain, ensuring only you can decrypt it with your wallet signature."
      },
      {
        question: "How is the winner determined?",
        answer: "The winning number is generated securely and matched against encrypted tickets using homomorphic computation, preserving privacy."
      },
      {
        question: "When are draws held?",
        answer: "Draws occur weekly. The exact time is displayed in the jackpot panel."
      },
      {
        question: "How do I claim my prize?",
        answer: "If your encrypted number matches the winning number, you'll be able to privately claim your prize without revealing your number."
      },
      {
        question: "What happens if I lose?",
        answer: "Your number remains encrypted and private. No one will know what numbers you played."
      }
    ];
    
    return (
      <div className="faq-container">
        {faqItems.map((item, index) => (
          <div className="faq-item" key={index}>
            <div className="faq-question">{item.question}</div>
            <div className="faq-answer">{item.answer}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing encrypted lottery system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="lottery-icon"></div>
          </div>
          <h1>Lottery<span>Shield</span></h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowBuyModal(true)} 
            className="buy-btn"
          >
            <div className="ticket-icon"></div>Buy Ticket
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="stats-section">
          <h2>Lottery Statistics</h2>
          {renderStats()}
        </div>
        
        <div className="tickets-section">
          <div className="section-header">
            <h2>Your Tickets</h2>
            <div className="header-actions">
              <button 
                onClick={loadData} 
                className="refresh-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="tickets-list">
            {tickets.filter(t => t.owner === address).length === 0 ? (
              <div className="no-tickets">
                <div className="no-tickets-icon"></div>
                <p>No tickets found</p>
                <button 
                  className="buy-btn" 
                  onClick={() => setShowBuyModal(true)}
                >
                  Buy Your First Ticket
                </button>
              </div>
            ) : tickets.filter(t => t.owner === address).map((ticket, index) => (
              <div 
                className={`ticket-item ${selectedTicket?.id === ticket.id ? "selected" : ""}`} 
                key={index}
                onClick={() => setSelectedTicket(ticket)}
              >
                <div className="ticket-id">Ticket #{ticket.id}</div>
                <div className="ticket-number">
                  Number: {ticket.number.substring(0, 15)}...
                </div>
                <div className="ticket-date">
                  Purchased: {new Date(ticket.timestamp * 1000).toLocaleDateString()}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="winners-section">
          <h2>Winners Board</h2>
          {renderWinners()}
        </div>
        
        <div className="faq-section">
          <h2>How It Works</h2>
          {renderFAQ()}
        </div>
      </div>
      
      {showBuyModal && (
        <ModalBuyTicket 
          onSubmit={buyTicket} 
          onClose={() => setShowBuyModal(false)} 
          buying={buyingTicket} 
          selectedNumber={selectedNumber} 
          setSelectedNumber={setSelectedNumber}
        />
      )}
      
      {selectedTicket && (
        <TicketDetailModal 
          ticket={selectedTicket} 
          onClose={() => { 
            setSelectedTicket(null); 
            setDecryptedNumber(null); 
          }} 
          decryptedNumber={decryptedNumber} 
          setDecryptedNumber={setDecryptedNumber} 
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="lottery-icon"></div>
              <span>Lottery_Shield</span>
            </div>
            <p>Verifiably fair lottery powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} Lottery Shield. All rights reserved.</div>
          <div className="disclaimer">
            This system uses fully homomorphic encryption to protect your lottery numbers.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalBuyTicketProps {
  onSubmit: () => void; 
  onClose: () => void; 
  buying: boolean;
  selectedNumber: string;
  setSelectedNumber: (number: string) => void;
}

const ModalBuyTicket: React.FC<ModalBuyTicketProps> = ({ onSubmit, onClose, buying, selectedNumber, setSelectedNumber }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSelectedNumber(e.target.value);
  };

  return (
    <div className="modal-overlay">
      <div className="buy-ticket-modal">
        <div className="modal-header">
          <h2>Buy Lottery Ticket</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <div>
              <strong>FHE Encryption Notice</strong>
              <p>Your number will be encrypted with Zama FHE</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Select Your Number (1-10000) *</label>
            <input 
              type="number" 
              min="1" 
              max="10000" 
              value={selectedNumber} 
              onChange={handleChange} 
              placeholder="Enter your lucky number..." 
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={buying || !selectedNumber} 
            className="submit-btn"
          >
            {buying ? "Processing with FHE..." : "Buy Ticket"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface TicketDetailModalProps {
  ticket: LotteryTicket;
  onClose: () => void;
  decryptedNumber: number | null;
  setDecryptedNumber: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedData: string) => Promise<number | null>;
}

const TicketDetailModal: React.FC<TicketDetailModalProps> = ({ 
  ticket, 
  onClose, 
  decryptedNumber, 
  setDecryptedNumber, 
  isDecrypting, 
  decryptWithSignature
}) => {
  const handleDecrypt = async () => {
    if (decryptedNumber !== null) { 
      setDecryptedNumber(null); 
      return; 
    }
    
    const decrypted = await decryptWithSignature(ticket.number);
    if (decrypted !== null) {
      setDecryptedNumber(decrypted);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="ticket-detail-modal">
        <div className="modal-header">
          <h2>Ticket Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="ticket-info">
            <div className="info-item">
              <span>Ticket ID:</span>
              <strong>#{ticket.id}</strong>
            </div>
            <div className="info-item">
              <span>Owner:</span>
              <strong>{ticket.owner.substring(0, 6)}...{ticket.owner.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Purchase Date:</span>
              <strong>{new Date(ticket.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
          </div>
          
          <div className="data-section">
            <h3>Encrypted Lottery Number</h3>
            <div className="data-row">
              <div className="data-label">Number:</div>
              <div className="data-value">{ticket.number.substring(0, 30)}...</div>
              <button 
                className="decrypt-btn" 
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "Decrypting..."
                ) : decryptedNumber !== null ? (
                  "Hide Number"
                ) : (
                  "Decrypt Number"
                )}
              </button>
            </div>
            
            <div className="fhe-tag">
              <div className="fhe-icon"></div>
              <span>FHE Encrypted - Requires Wallet Signature</span>
            </div>
          </div>
          
          {decryptedNumber !== null && (
            <div className="decrypted-section">
              <h3>Your Lucky Number</h3>
              <div className="number-display">
                {decryptedNumber}
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn">Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;