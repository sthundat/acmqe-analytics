# ACMQE Analytics Rightsizing Tests
This repository contains Cypress-based UI tests for validating the rightsizing feature in Red Hat Advanced Cluster Management (ACM)

## Prerequisite
 - [Node.js](https://nodejs.org/) **v18 or higher**

## Install dependencies
All required dependencies are defined in `package.json`. To install them and prepare the project for Cypress tests, run:

```bash
npm install
```
This installs the dependencies into  `node_modules/` folder.

## 🔐 Environment Configuration

To run Cypress tests locally, create a `cypress.env.json` file in the project root and provide login credentials:

```json
{
  "USERNAME": "your-cluster-username",
  "PASSWORD": "your-cluster-password",
  "OC_SERVER_URL": "your-cluster-server-url"
}
```
Important: Do not commit this file. It should be added to  `.gitignore`.

### Start Cypress
You can run Cypress in interactive (GUI) mode or headless mode:
Interactive mode:
```bash
npx cypress open
```
Headless mode:
```bash
npx cypress run
```
