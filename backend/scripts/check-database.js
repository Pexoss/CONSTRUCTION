const mongoose = require('mongoose');
require('dotenv').config();

async function checkDatabase() {
  try {
    // Conectar ao MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Conectado ao MongoDB');
    
    // Listar todos os bancos
    const admin = mongoose.connection.db.admin();
    const databases = await admin.listDatabases();
    
    console.log('\n📊 Bancos de dados disponíveis:');
    databases.databases.forEach(db => {
      console.log(`  - ${db.name} (${(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB)`);
    });
    
    // Verificar se nosso banco existe
    const dbName = 'construction-rental';
    const exists = databases.databases.some(db => db.name === dbName);
    
    if (exists) {
      console.log(`\n✅ Banco "${dbName}" encontrado!`);
      
      // Listar collections
      mongoose.connection.useDb(dbName);
      const db = mongoose.connection.db;
      const collections = await db.listCollections().toArray();
      
      console.log('\n📁 Collections:');
      if (collections.length === 0) {
        console.log('  (nenhuma collection ainda)');
        console.log('  💡 Registre uma empresa via API para criar collections automaticamente.');
      } else {
        collections.forEach(col => {
          console.log(`  - ${col.name}`);
        });
      }
    } else {
      console.log(`\n⚠️  Banco "${dbName}" ainda não foi criado.`);
      console.log('💡 Dica: Registre uma empresa via API para criar o banco automaticamente.');
    }
    
    await mongoose.connection.close();
    console.log('\n✅ Conexão fechada');
  } catch (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
}

checkDatabase();
