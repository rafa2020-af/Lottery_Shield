# Lottery Shield: A Fully Homomorphic Encrypted Lottery

Lottery Shield is an innovative verifiably fair lottery platform that leverages **Zama's Fully Homomorphic Encryption (FHE) technology**. This project ensures that users' lottery ticket numbers are encrypted, providing a secure environment where the privacy of each participant is paramount from ticket purchase to prize claiming. 

## Addressing the Challenge of Trust in Lotteries

In traditional lottery systems, players often express concerns regarding transparency and fairness. The reliance on centralized processes to generate winning numbers can lead to skepticism, where users question the integrity of the draw and the security of their personal information. This mistrust diminishes user confidence and participation in lottery games.

## Empowering Trust with FHE

Lottery Shield tackles these challenges head-on by implementing **Fully Homomorphic Encryption** through Zama's open-source libraries. With FHE, all lottery ticket numbers are encrypted at the time of purchase. When the drawing occurs, the winning number is securely generated and matched against the encrypted tickets using homomorphic techniques. This approach ensures that no sensitive data is exposed during the process, safeguarding user privacy while simultaneously allowing for transparent and verifiable results.

## Core Features

- 🔒 **Encrypted Ticket Numbers:** Each user's lottery ticket number is encrypted using FHE, ensuring complete confidentiality.
- 🎉 **Secure Winning Number Generation:** Winning numbers are generated in a secure manner, free from tampering or biases.
- 🏆 **On-Chain Homomorphic Matching:** The winning number is matched against all encrypted tickets on-chain, preserving user privacy throughout the process.
- 📊 **Prize Pool Dashboard:** A user-friendly dashboard displays the prize pool and allows participants to select their lottery numbers.
- 🥳 **Anonymous Prize Claiming:** Winners can claim their prizes without revealing their identity, ensuring complete privacy.

## Technology Stack

- **Zama SDK:** Concrete, TFHE-rs for implementing FHE.
- **Solidity:** For Ethereum smart contracts.
- **Node.js:** JavaScript runtime for server-side applications.
- **Hardhat:** Development environment to compile, test, and deploy smart contracts.

## Directory Structure

```plaintext
Lottery_Shield/
├── contracts/
│   └── Lottery_Shield.sol
├── scripts/
│   ├── draw_winner.js
│   └── setup_lottery.js
├── tests/
│   ├── lottery_test.js
│   └── security_test.js
├── package.json
└── README.md
```

## Setting Up Lottery Shield

To set up the Lottery Shield project, follow these instructions:

1. **Ensure you have Node.js installed on your machine.**
2. **Install Hardhat:** Use npm to install Hardhat, which will help you manage and deploy your smart contracts.
3. **Install Dependencies:** Run the following command in your project directory to install necessary dependencies, including the Zama FHE libraries:
   ```bash
   npm install
   ```

> **Important:** Do not use `git clone` or any URLs to obtain the project files.

## Building and Running the Project

### Compile Smart Contracts

To compile your smart contracts, run:
```bash
npx hardhat compile
```

### Testing the Lottery Functionality

To run tests and ensure everything is working correctly, execute:
```bash
npx hardhat test
```

### Deploying the Lottery Application

To deploy the Lottery Shield application, use:
```bash
npx hardhat run scripts/setup_lottery.js --network <network_name>
```

Replace `<network_name>` with the desired Ethereum network (e.g., testnet).

## Code Snippet: Secure Ticket Purchase

Here's an example of how to securely purchase a lottery ticket within the Lottery Shield application:

```javascript
async function purchaseTicket(userId, ticketNumber) {
    const ticketEncrypted = await encryptUsingFHE(ticketNumber);
    const result = await lotteryContract.purchaseTicket(userId, ticketEncrypted);
    console.log("Ticket purchased successfully:", result);
}
```

This function takes a user's ID and a plain ticket number, encrypts it using FHE, and sends the encrypted ticket to the blockchain for storage.

---

## Acknowledgements

The development of Lottery Shield is made possible thanks to the innovative efforts of the **Zama team**. Their pioneering work in homomorphic encryption and the open-source tools they provide have been instrumental in creating trustworthy and confidential blockchain applications. Thank you for making this project a reality!
