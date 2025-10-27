pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract LotteryShieldFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    error NotOwner();
    error NotProvider();
    error Paused();
    error CooldownActive();
    error BatchNotOpen();
    error BatchClosed();
    error InvalidCooldown();
    error InvalidBatchState();
    error ReplayDetected();
    error StateMismatch();
    error InvalidTicketNumber();
    error InvalidWinningNumber();
    error InvalidBatchId();
    error NoEncryptedTickets();

    event OwnerSet(address indexed oldOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event PausedSet(bool paused);
    event CooldownSecondsSet(uint256 oldCooldown, uint256 newCooldown);
    event BatchOpened(uint256 indexed batchId);
    event BatchClosed(uint256 indexed batchId);
    event TicketSubmitted(address indexed buyer, uint256 indexed batchId, bytes32 encryptedTicket);
    event WinningNumberSet(uint256 indexed batchId, bytes32 encryptedWinningNumber);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 winningNumber, address winner, uint256 payoutAmount);

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    uint256 public currentBatchId;
    bool public batchOpen;
    mapping(uint256 => euint32) public encryptedTickets;
    mapping(uint256 => address) public ticketBuyers;
    mapping(uint256 => euint32) public encryptedWinningNumbers;
    mapping(uint256 => bool) public batchClosedStatus;
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert Paused();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnerSet(address(0), msg.sender);
        isProvider[msg.sender] = true;
        emit ProviderAdded(msg.sender);
        _initIfNeeded();
    }

    function _initIfNeeded() internal {
        if (!FHE.isInitialized()) {
            FHE.initialize();
        }
    }

    function _requireInitialized() internal view {
        if (!FHE.isInitialized()) {
            revert("FHE not initialized");
        }
    }

    function setOwner(address newOwner) external onlyOwner {
        emit OwnerSet(owner, newOwner);
        owner = newOwner;
    }

    function addProvider(address provider) external onlyOwner {
        isProvider[provider] = true;
        emit ProviderAdded(provider);
    }

    function removeProvider(address provider) external onlyOwner {
        delete isProvider[provider];
        emit ProviderRemoved(provider);
    }

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        if (newCooldownSeconds == 0) revert InvalidCooldown();
        emit CooldownSecondsSet(cooldownSeconds, newCooldownSeconds);
        cooldownSeconds = newCooldownSeconds;
    }

    function openBatch() external onlyProvider whenNotPaused {
        if (batchOpen) revert InvalidBatchState();
        currentBatchId++;
        batchOpen = true;
        emit BatchOpened(currentBatchId);
    }

    function closeBatch() external onlyProvider whenNotPaused {
        if (!batchOpen) revert InvalidBatchState();
        batchOpen = false;
        batchClosedStatus[currentBatchId] = true;
        emit BatchClosed(currentBatchId);
    }

    function submitTicket(uint32 ticketNumber) external payable whenNotPaused checkSubmissionCooldown {
        if (!batchOpen) revert BatchNotOpen();
        if (ticketNumber > 9999) revert InvalidTicketNumber();

        lastSubmissionTime[msg.sender] = block.timestamp;
        encryptedTickets[currentBatchId] = FHE.asEuint32(ticketNumber);
        ticketBuyers[currentBatchId] = msg.sender;
        emit TicketSubmitted(msg.sender, currentBatchId, FHE.toBytes32(encryptedTickets[currentBatchId]));
    }

    function setWinningNumber(uint32 winningNumber) external onlyProvider whenNotPaused {
        if (batchOpen) revert BatchNotOpen();
        if (!batchClosedStatus[currentBatchId]) revert BatchClosed();
        if (winningNumber > 9999) revert InvalidWinningNumber();

        encryptedWinningNumbers[currentBatchId] = FHE.asEuint32(winningNumber);
        emit WinningNumberSet(currentBatchId, FHE.toBytes32(encryptedWinningNumbers[currentBatchId]));
    }

    function requestWinnerDecryption(uint256 batchId) external onlyProvider whenNotPaused checkDecryptionCooldown {
        if (!batchClosedStatus[batchId]) revert InvalidBatchId();
        if (encryptedTickets[batchId].isEmpty()) revert NoEncryptedTickets();
        if (encryptedWinningNumbers[batchId].isEmpty()) revert("Winning number not set");

        lastDecryptionRequestTime[msg.sender] = block.timestamp;

        euint32 memory encryptedTicket = encryptedTickets[batchId];
        euint32 memory encryptedWinningNumber = encryptedWinningNumbers[batchId];
        ebool memory isWinner = encryptedTicket.eq(encryptedWinningNumber);

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = FHE.toBytes32(isWinner);

        bytes32 stateHash = keccak256(abi.encode(cts, address(this)));
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({ batchId: batchId, stateHash: stateHash, processed: false });
        emit DecryptionRequested(requestId, batchId);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayDetected();

        uint256 batchId = decryptionContexts[requestId].batchId;
        euint32 memory encryptedTicket = encryptedTickets[batchId];
        euint32 memory encryptedWinningNumber = encryptedWinningNumbers[batchId];
        ebool memory isWinner = encryptedTicket.eq(encryptedWinningNumber);

        bytes32[] memory currentCts = new bytes32[](1);
        currentCts[0] = FHE.toBytes32(isWinner);
        bytes32 currentStateHash = keccak256(abi.encode(currentCts, address(this)));

        if (currentStateHash != decryptionContexts[requestId].stateHash) {
            revert StateMismatch();
        }

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint8 isWinnerCleartext = abi.decode(cleartexts, (uint8));
        address winner = address(0);
        uint256 winningNumber = 0;
        uint256 payoutAmount = 0;

        if (isWinnerCleartext == 1) {
            winner = ticketBuyers[batchId];
            winningNumber = FHE.asEuint32(encryptedWinningNumber).decrypt();
            payoutAmount = address(this).balance;
        }

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, batchId, winningNumber, winner, payoutAmount);

        if (winner != address(0)) {
            payable(winner).transfer(payoutAmount);
        }
    }

    receive() external payable {}
}