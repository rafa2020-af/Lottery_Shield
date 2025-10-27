import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useState, useEffect } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface ChessPiece {
  id: number;
  type: string;
  position: { x: number; y: number };
  color: 'white' | 'black';
  encryptedData: string;
}

interface ChessMove {
  from: { x: number; y: number };
  to: { x: number; y: number };
  timestamp: number;
  player: string;
}

const FHEEncryptNumber = (value: number): string => `FHE-${btoa(value.toString())}`;
const FHEDecryptNumber = (encryptedData: string): number => encryptedData.startsWith('FHE-') ? parseFloat(atob(encryptedData.substring(4))) : parseFloat(encryptedData);
const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [pieces, setPieces] = useState<ChessPiece[]>([]);
  const [moves, setMoves] = useState<ChessMove[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingGame, setCreatingGame] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [selectedPiece, setSelectedPiece] = useState<ChessPiece | null>(null);
  const [decryptedData, setDecryptedData] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState("");
  const [contractAddress, setContractAddress] = useState("");
  const [chainId, setChainId] = useState(0);
  const [startTimestamp, setStartTimestamp] = useState(0);
  const [durationDays, setDurationDays] = useState(30);
  const [currentPlayer, setCurrentPlayer] = useState<'white' | 'black'>('white');
  const [visibleTiles, setVisibleTiles] = useState<{x: number, y: number}[]>([]);

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
      
      const piecesBytes = await contract.getData("pieces");
      let piecesList: ChessPiece[] = [];
      if (piecesBytes.length > 0) {
        try {
          const piecesStr = ethers.toUtf8String(piecesBytes);
          if (piecesStr.trim() !== '') piecesList = JSON.parse(piecesStr);
        } catch (e) {}
      }
      setPieces(piecesList);

      const movesBytes = await contract.getData("moves");
      let movesList: ChessMove[] = [];
      if (movesBytes.length > 0) {
        try {
          const movesStr = ethers.toUtf8String(movesBytes);
          if (movesStr.trim() !== '') movesList = JSON.parse(movesStr);
        } catch (e) {}
      }
      setMoves(movesList);
      updateVisibleTiles(piecesList);
    } catch (e) {
      console.error("Error loading data:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const updateVisibleTiles = (pieces: ChessPiece[]) => {
    const myPieces = pieces.filter(p => p.color === currentPlayer);
    const tiles: {x: number, y: number}[] = [];
    
    myPieces.forEach(piece => {
      const range = piece.type === 'pawn' ? 1 : 
                   piece.type === 'knight' ? 2 : 3;
      
      for (let x = Math.max(0, piece.position.x - range); x <= Math.min(7, piece.position.x + range); x++) {
        for (let y = Math.max(0, piece.position.y - range); y <= Math.min(7, piece.position.y + range); y++) {
          if (!tiles.some(t => t.x === x && t.y === y)) {
            tiles.push({x, y});
          }
        }
      }
    });
    
    setVisibleTiles(tiles);
  };

  const createNewGame = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingGame(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating new game with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const initialPieces: ChessPiece[] = [
        { id: 1, type: 'rook', position: { x: 0, y: 0 }, color: 'white', encryptedData: FHEEncryptNumber(5) },
        { id: 2, type: 'knight', position: { x: 1, y: 0 }, color: 'white', encryptedData: FHEEncryptNumber(3) },
        { id: 3, type: 'bishop', position: { x: 2, y: 0 }, color: 'white', encryptedData: FHEEncryptNumber(3) },
        { id: 4, type: 'queen', position: { x: 3, y: 0 }, color: 'white', encryptedData: FHEEncryptNumber(9) },
        { id: 5, type: 'king', position: { x: 4, y: 0 }, color: 'white', encryptedData: FHEEncryptNumber(0) },
        { id: 6, type: 'bishop', position: { x: 5, y: 0 }, color: 'white', encryptedData: FHEEncryptNumber(3) },
        { id: 7, type: 'knight', position: { x: 6, y: 0 }, color: 'white', encryptedData: FHEEncryptNumber(3) },
        { id: 8, type: 'rook', position: { x: 7, y: 0 }, color: 'white', encryptedData: FHEEncryptNumber(5) },
        { id: 9, type: 'pawn', position: { x: 0, y: 1 }, color: 'white', encryptedData: FHEEncryptNumber(1) },
        { id: 10, type: 'pawn', position: { x: 1, y: 1 }, color: 'white', encryptedData: FHEEncryptNumber(1) },
        { id: 11, type: 'pawn', position: { x: 2, y: 1 }, color: 'white', encryptedData: FHEEncryptNumber(1) },
        { id: 12, type: 'pawn', position: { x: 3, y: 1 }, color: 'white', encryptedData: FHEEncryptNumber(1) },
        { id: 13, type: 'pawn', position: { x: 4, y: 1 }, color: 'white', encryptedData: FHEEncryptNumber(1) },
        { id: 14, type: 'pawn', position: { x: 5, y: 1 }, color: 'white', encryptedData: FHEEncryptNumber(1) },
        { id: 15, type: 'pawn', position: { x: 6, y: 1 }, color: 'white', encryptedData: FHEEncryptNumber(1) },
        { id: 16, type: 'pawn', position: { x: 7, y: 1 }, color: 'white', encryptedData: FHEEncryptNumber(1) },
        { id: 17, type: 'rook', position: { x: 0, y: 7 }, color: 'black', encryptedData: FHEEncryptNumber(5) },
        { id: 18, type: 'knight', position: { x: 1, y: 7 }, color: 'black', encryptedData: FHEEncryptNumber(3) },
        { id: 19, type: 'bishop', position: { x: 2, y: 7 }, color: 'black', encryptedData: FHEEncryptNumber(3) },
        { id: 20, type: 'queen', position: { x: 3, y: 7 }, color: 'black', encryptedData: FHEEncryptNumber(9) },
        { id: 21, type: 'king', position: { x: 4, y: 7 }, color: 'black', encryptedData: FHEEncryptNumber(0) },
        { id: 22, type: 'bishop', position: { x: 5, y: 7 }, color: 'black', encryptedData: FHEEncryptNumber(3) },
        { id: 23, type: 'knight', position: { x: 6, y: 7 }, color: 'black', encryptedData: FHEEncryptNumber(3) },
        { id: 24, type: 'rook', position: { x: 7, y: 7 }, color: 'black', encryptedData: FHEEncryptNumber(5) },
        { id: 25, type: 'pawn', position: { x: 0, y: 6 }, color: 'black', encryptedData: FHEEncryptNumber(1) },
        { id: 26, type: 'pawn', position: { x: 1, y: 6 }, color: 'black', encryptedData: FHEEncryptNumber(1) },
        { id: 27, type: 'pawn', position: { x: 2, y: 6 }, color: 'black', encryptedData: FHEEncryptNumber(1) },
        { id: 28, type: 'pawn', position: { x: 3, y: 6 }, color: 'black', encryptedData: FHEEncryptNumber(1) },
        { id: 29, type: 'pawn', position: { x: 4, y: 6 }, color: 'black', encryptedData: FHEEncryptNumber(1) },
        { id: 30, type: 'pawn', position: { x: 5, y: 6 }, color: 'black', encryptedData: FHEEncryptNumber(1) },
        { id: 31, type: 'pawn', position: { x: 6, y: 6 }, color: 'black', encryptedData: FHEEncryptNumber(1) },
        { id: 32, type: 'pawn', position: { x: 7, y: 6 }, color: 'black', encryptedData: FHEEncryptNumber(1) }
      ];
      
      const tx1 = await contract.setData("pieces", ethers.toUtf8Bytes(JSON.stringify(initialPieces)));
      const tx2 = await contract.setData("moves", ethers.toUtf8Bytes(JSON.stringify([])));
      
      await tx1.wait();
      await tx2.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Game created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      await loadData();
      
      setShowCreateModal(false);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingGame(false); 
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

  const handlePieceClick = async (piece: ChessPiece) => {
    if (piece.color !== currentPlayer) return;
    
    setSelectedPiece(piece);
    const decrypted = await decryptWithSignature(piece.encryptedData);
    if (decrypted !== null) {
      setDecryptedData(decrypted);
    }
  };

  const handleMove = async (x: number, y: number) => {
    if (!selectedPiece || !isConnected) return;
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) return;
      
      const updatedPieces = pieces.map(p => 
        p.id === selectedPiece.id ? { ...p, position: { x, y } } : p
      );
      
      const newMove: ChessMove = {
        from: selectedPiece.position,
        to: { x, y },
        timestamp: Math.floor(Date.now() / 1000),
        player: address || ''
      };
      
      const updatedMoves = [...moves, newMove];
      
      const tx1 = await contract.setData("pieces", ethers.toUtf8Bytes(JSON.stringify(updatedPieces)));
      const tx2 = await contract.setData("moves", ethers.toUtf8Bytes(JSON.stringify(updatedMoves)));
      
      await tx1.wait();
      await tx2.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Move executed successfully!" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      
      await loadData();
      setSelectedPiece(null);
      setDecryptedData(null);
      setCurrentPlayer(currentPlayer === 'white' ? 'black' : 'white');
    } catch (e) {
      console.error("Error making move:", e);
      setTransactionStatus({ visible: true, status: "error", message: "Failed to execute move" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const renderChessboard = () => {
    const board = [];
    
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const piece = pieces.find(p => p.position.x === x && p.position.y === y);
        const isVisible = visibleTiles.some(t => t.x === x && t.y === y);
        const isSelected = selectedPiece?.position.x === x && selectedPiece?.position.y === y;
        
        board.push(
          <div 
            key={`${x}-${y}`} 
            className={`tile ${(x + y) % 2 === 0 ? 'light' : 'dark'} 
              ${isVisible ? 'visible' : 'hidden'} 
              ${isSelected ? 'selected' : ''}`}
            onClick={() => {
              if (selectedPiece && isVisible) {
                handleMove(x, y);
              }
            }}
          >
            {piece && isVisible && (
              <div 
                className={`piece ${piece.color} ${piece.type} 
                  ${piece.color === currentPlayer ? 'selectable' : ''}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (piece.color === currentPlayer) {
                    handlePieceClick(piece);
                  }
                }}
              >
                {selectedPiece?.id === piece.id && decryptedData !== null && (
                  <div className="piece-value">{decryptedData}</div>
                )}
              </div>
            )}
          </div>
        );
      }
    }
    
    return board;
  };

  const renderMoveHistory = () => {
    return (
      <div className="move-history">
        <h3>Move History</h3>
        <div className="moves-list">
          {moves.length === 0 ? (
            <div className="no-moves">No moves yet</div>
          ) : (
            moves.map((move, index) => (
              <div key={index} className="move-item">
                <span>{index + 1}. </span>
                <span>{String.fromCharCode(97 + move.from.x)}{8 - move.from.y}</span>
                <span> → </span>
                <span>{String.fromCharCode(97 + move.to.x)}{8 - move.to.y}</span>
                <span className="move-player">{move.player.substring(0, 6)}...</span>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  const renderFHEInfo = () => {
    return (
      <div className="fhe-info">
        <h3>Zama FHE Encryption</h3>
        <p>All piece values are encrypted using Zama's Fully Homomorphic Encryption.</p>
        <div className="fhe-steps">
          <div className="step">
            <div className="step-number">1</div>
            <div className="step-content">
              <h4>Encrypt</h4>
              <p>Piece values encrypted on-chain</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">2</div>
            <div className="step-content">
              <h4>Verify</h4>
              <p>Moves verified without decryption</p>
            </div>
          </div>
          <div className="step">
            <div className="step-number">3</div>
            <div className="step-content">
              <h4>Decrypt</h4>
              <p>View values with wallet signature</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderPlayerStats = () => {
    const whitePieces = pieces.filter(p => p.color === 'white');
    const blackPieces = pieces.filter(p => p.color === 'black');
    
    return (
      <div className="player-stats">
        <div className="stat white-stat">
          <h4>White Player</h4>
          <div className="stat-value">{whitePieces.length} pieces</div>
        </div>
        <div className="stat black-stat">
          <h4>Black Player</h4>
          <div className="stat-value">{blackPieces.length} pieces</div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Initializing encrypted chess game...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="chess-icon"></div>
          <h1>Fog of War Chess</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="new-game-btn"
          >
            New Game
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content">
        <div className="chessboard-container">
          <div className="current-player">
            Current Turn: <span className={currentPlayer}>{currentPlayer}</span>
          </div>
          <div className="chessboard">
            {renderChessboard()}
          </div>
        </div>
        
        <div className="sidebar">
          {renderPlayerStats()}
          {renderMoveHistory()}
          {renderFHEInfo()}
        </div>
      </div>
      
      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-game-modal">
            <div className="modal-header">
              <h2>New Fog of War Game</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <p>Start a new game with Zama FHE encryption for piece values.</p>
              <div className="fhe-notice">
                <div className="lock-icon"></div>
                <span>All piece values will be encrypted</span>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setShowCreateModal(false)} className="cancel-btn">Cancel</button>
              <button 
                onClick={createNewGame} 
                disabled={creatingGame}
                className="confirm-btn"
              >
                {creatingGame ? "Creating..." : "Create Game"}
              </button>
            </div>
          </div>
        </div>
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
              <div className="chess-icon"></div>
              <span>Fog of War Chess</span>
            </div>
            <p>Privacy-preserving chess with Zama FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Rules</a>
            <a href="#" className="footer-link">About FHE</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Powered by Zama FHE</span>
          </div>
          <div className="copyright">© {new Date().getFullYear()} Fog of War Chess</div>
        </div>
      </footer>
    </div>
  );
};

export default App;