<template>
    <div class="card">
        <h2>💾 Dataverse API Examples</h2>

        <div class="example-group">
            <h3>Query Records</h3>
            <button @click="queryAccounts" class="btn btn-primary">Query Top 10 Accounts</button>
            <div class="output">{{ queryOutput }}</div>
        </div>

        <div class="example-group">
            <h3>CRUD Operations</h3>
            <div class="input-group">
                <label for="account-name">Account Name:</label>
                <input type="text" id="account-name" v-model="accountName" placeholder="Enter account name" />
            </div>
            <div class="button-group">
                <button @click="createAccount" class="btn btn-primary">Create Account</button>
                <button @click="updateAccount" class="btn" :disabled="!createdAccountId">Update Account</button>
                <button @click="deleteAccount" class="btn btn-error" :disabled="!createdAccountId">Delete Account</button>
            </div>
            <div class="output">{{ crudOutput }}</div>
        </div>

        <div class="example-group">
            <h3>Metadata</h3>
            <button @click="getAccountMetadata" class="btn">Get Account Metadata</button>
            <div class="output">{{ metadataOutput }}</div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
    connection: ToolBoxAPI.DataverseConnection | null;
}>();

const emit = defineEmits<{
    log: [message: string, type?: 'info' | 'success' | 'warning' | 'error'];
}>();

const accountName = ref('Sample Account');
const createdAccountId = ref<string | null>(null);
const queryOutput = ref('');
const crudOutput = ref('');
const metadataOutput = ref('');

const showNotification = async (title: string, body: string, type: 'success' | 'info' | 'warning' | 'error') => {
    try {
        await window.toolboxAPI.utils.showNotification({ title, body, type, duration: 3000 });
    } catch (error) {
        console.error('Error showing notification:', error);
    }
};

const queryAccounts = async () => {
    if (!props.connection) {
        await showNotification('No Connection', 'Please connect to a Dataverse environment', 'warning');
        return;
    }

    try {
        queryOutput.value = 'Querying accounts...\n';

        const fetchXml = `
<fetch top="10">
  <entity name="account">
    <attribute name="name" />
    <attribute name="accountid" />
    <attribute name="emailaddress1" />
    <attribute name="telephone1" />
    <order attribute="name" />
  </entity>
</fetch>
        `.trim();

        const result = await window.dataverseAPI.fetchXmlQuery(fetchXml);

        let output = `Found ${result.value.length} account(s):\n\n`;
        result.value.forEach((account: any, index: number) => {
            output += `${index + 1}. ${account.name}\n`;
            output += `   ID: ${account.accountid}\n`;
            if (account.emailaddress1) output += `   Email: ${account.emailaddress1}\n`;
            if (account.telephone1) output += `   Phone: ${account.telephone1}\n`;
            output += '\n';
        });

        queryOutput.value = output;
        emit('log', `Queried ${result.value.length} accounts`, 'success');
    } catch (error) {
        queryOutput.value = `Error: ${(error as Error).message}`;
        emit('log', `Error querying accounts: ${(error as Error).message}`, 'error');
    }
};

const createAccount = async () => {
    if (!props.connection) {
        await showNotification('No Connection', 'Please connect to a Dataverse environment', 'warning');
        return;
    }

    try {
        crudOutput.value = 'Creating account...\n';

        const result = await window.dataverseAPI.create('account', {
            name: accountName.value,
            emailaddress1: 'sample@example.com',
            telephone1: '555-0100',
            description: 'Created by Vue Sample Tool',
        });

        createdAccountId.value = result.id;
        crudOutput.value = `Account created successfully!\n\nID: ${result.id}\nName: ${accountName.value}\n`;

        await showNotification('Account Created', `Account "${accountName.value}" created successfully`, 'success');
        emit('log', `Account created: ${result.id}`, 'success');
    } catch (error) {
        crudOutput.value = `Error: ${(error as Error).message}`;
        emit('log', `Error creating account: ${(error as Error).message}`, 'error');
    }
};

const updateAccount = async () => {
    if (!createdAccountId.value) {
        await showNotification('No Account', 'Please create an account first', 'warning');
        return;
    }

    try {
        crudOutput.value = 'Updating account...\n';

        await window.dataverseAPI.update('account', createdAccountId.value, {
            description: 'Updated by Vue Sample Tool at ' + new Date().toISOString(),
            telephone1: '555-0200',
        });

        crudOutput.value = `Account updated successfully!\n\nID: ${createdAccountId.value}\nUpdated fields: description, telephone1\n`;

        await showNotification('Account Updated', 'Account updated successfully', 'success');
        emit('log', `Account updated: ${createdAccountId.value}`, 'success');
    } catch (error) {
        crudOutput.value = `Error: ${(error as Error).message}`;
        emit('log', `Error updating account: ${(error as Error).message}`, 'error');
    }
};

const deleteAccount = async () => {
    if (!createdAccountId.value) {
        await showNotification('No Account', 'Please create an account first', 'warning');
        return;
    }

    try {
        crudOutput.value = 'Deleting account...\n';

        await window.dataverseAPI.delete('account', createdAccountId.value);

        crudOutput.value = `Account deleted successfully!\n\nID: ${createdAccountId.value}\n`;

        await showNotification('Account Deleted', 'Account deleted successfully', 'success');
        emit('log', `Account deleted: ${createdAccountId.value}`, 'success');
        createdAccountId.value = null;
    } catch (error) {
        crudOutput.value = `Error: ${(error as Error).message}`;
        emit('log', `Error deleting account: ${(error as Error).message}`, 'error');
    }
};

const getAccountMetadata = async () => {
    if (!props.connection) {
        await showNotification('No Connection', 'Please connect to a Dataverse environment', 'warning');
        return;
    }

    try {
        metadataOutput.value = 'Retrieving metadata...\n';

        const metadata = await window.dataverseAPI.getEntityMetadata('account');

        let output = 'Account Entity Metadata:\n\n';
        output += `Logical Name: ${metadata.LogicalName}\n`;
        output += `Metadata ID: ${metadata.MetadataId}\n`;
        output += `Display Name: ${metadata.DisplayName?.LocalizedLabels?.[0]?.Label || 'N/A'}\n`;
        output += `Attributes: ${metadata.Attributes?.length || 0}\n`;

        if (metadata.Attributes && metadata.Attributes.length > 0) {
            output += '\nSample Attributes:\n';
            metadata.Attributes.slice(0, 5).forEach((attr: any) => {
                output += `  - ${attr.LogicalName} (${attr.AttributeType})\n`;
            });
        }

        metadataOutput.value = output;
        emit('log', 'Account metadata retrieved', 'success');
    } catch (error) {
        metadataOutput.value = `Error: ${(error as Error).message}`;
        emit('log', `Error getting metadata: ${(error as Error).message}`, 'error');
    }
};
</script>
